/**
 * New node file
 */
var fs = require('fs');
var path = require('path');
var Domain = require('domain');
var inspect = require("util").inspect;
var _extend = require("util")._extend;
var urlParse = require('url').parse;
var querystring = require('querystring');
var depcle = require("./lib.js").depcle;
var mime = require("./mime");
var zlib = require('zlib');
var EventEmitter = require("events").EventEmitter;
var stream = require("stream");
var uri = require("./uri");

var getReqPath = function(url){
    var i = url.length;
    if((i=url.indexOf("?")) != -1){
        return url.substring(0,i);
    }else if((i = url.indexOf("#")) != -1){
        return url.substring(0,i);
    }
    return url;
};

/**
 * action的访问对像, 将做为在action中访问到的this对像出现.
 * 
 * 这个对像在每次请求到达时,在superAction中被创建,
 * 首先经过filter chain, 
 * 在filter chain结束后低达action,
 * 在response finish时被消毁.
 */
var ActionVisitor = function(req,res,engine){
	
	if(!req || !res){
		throw new Error("missing arguments");
	}
	
	var me = this , cookie = null;
	
	this.cachedExt = {};
	this.__tplEngine = engine;
	this.currentRouter = null; //在router中被设置
	
	EventEmitter.call(me);
	
	Object.defineProperties(this,{
		request:{
			configurable:true,
			enumerable:false,
			get: function(){
				return req;
			}
		},
		response:{
			configurable:true,
			enumerable:false,
			get:function(){
				return res;
			}
		}
	});
	
	this.req_pathname = getReqPath(req.url);
	
	 // 错误派发;
    var domain = Domain.create();
    
    domain.add(me);
    domain.add(req);
    domain.add(res);
    
    var errorHandle = function(err){
        	log.err(err.stack);
        	me.sendError(err,500);
    };
    
    domain.on("error",errorHandle);
    me.on("error",errorHandle);
    res.on("finish",function(){
        me.__destroy();
    });
}

ActionVisitor.prototype = _extend(Object.create(EventEmitter.prototype),{
	__destroy:function(){
		
		delete this.response;
		
		var cachedExt = this.cachedExt;
		
		for(var key in cachedExt){
			delete cachedExt[key];
		}
		
		for(var key in this){
			delete this[key];
		}
		
		this.destroyd = true;
	},
	/**
	 * 获得当前request中声明的支持压缩类型. 一般为deflate或gzip. 
	 * 当客户端同时支持两个时,优先返回deflate;
	 */
	getCompressType:function(){
		var req = this.request;
	    var acceptEncoding = req.headers['accept-encoding'];
	    if (!acceptEncoding) { acceptEncoding = ''; }
	    if (acceptEncoding.match(/\bdeflate\b/)) {
	        return 'deflate';
	    } else if (acceptEncoding.match(/\bgzip\b/)){
	        return 'gzip';
	    } else {
	        return '';
	    }
	},
	/**
	 * 根据request支持的类型,支持对应压缩类型的stream对像.
	 * @param pipeOnStream {WriteableStream} 
	 * 		当提供时,将直接将WriteableStream对像到返回的stream对像上.
	 * 		当未提供时,返回未对像到任何对像上的stream对像.
	 */
	getCompressStream:function(pipeOnStream){
		
		var rv = null;
		
		switch(this.getCompressType()){
			case "deflate" :
				rv = zlib.createDeflate();
				break;
			case "gzip":
				rv = zlib.createGzip();
			default:
				return null;
		}
		
		// 这里当pipeOnStream不能被pipe时,将由rv的pipe方法直接抛错.
		if(pipeOnStream){
			rv.pipe(pipeOnStream);
		}
		
		return rv;
	},
	/**
	 * 解析一般form表单的参数
	 * 即content-type = application/x-www-form-urlencoded
	 */
	parseForm:function(cb){
		var me = this;
		var isPost = /^post$/i;
		var req = me.request;
		try{
			if(this.__formParmas !== undefined){
				cb.call(this,null,this.__formParams);
				return;
			}
			/**
			 * 这里不需要对callbck做事件池的处理, 因为filter与action都是链式调用的,不存在多个filter或filter一起访问到parseForm的可能
			 */
			if(isPost.test(req.method) && req.headers["content-type"] == "application/x-www-form-urlencoded" && (contentLen = req.headers["content-length"]) > 0 ){
				//FIXME 暂时就是UTF8,爱咋咋地...留配置是以后的事情,暂时没时间..thanks!!!
				req.on("readable" , function(){
					
					req.setEncoding("utf-8");
					var content = req.read(contentLen);
					var formObj = querystring.parse(content);
					me.__formParams = formObj || {};
					cb && cb.call(me,null,me.__formParams);
					
				});
				
			}else{
				throw new Error("request not a FormData");
			}
		}catch(e){
			cb && cb.call(this,e,null);
		}
	},
	/**
	 * 解析包含文件上传表单
	 * 即content-type = multipart/form-data
	 */
	parseUploadForm:function(cb){
		/**
		 * 
		 */
		throw new Error("Not Implemented");
	},
	/**
	 * 解析出url中的query参数
	 */
	parseQuery:function(cb){
		if(cb instanceof Function){
			
			var err = null , urlObj;
			
			if(this.__uriQueryParmas !== undefined){
				cb.call(this , err , this.__uriQueryParmas);
				return;
			}
			
			this.__uriQueryParmas = null;
			
			try{
				urlObj = urlParse(this.request.url, true);
				this.__uriQueryParmas = urlObj.query;
			}catch(e){
				err = e;
			}finally{
				cb.call(this,err,this.__uriQueryParmas);
			}
		}
	},
	/**
	 * 一并解析urlQuery与formData.并返回一个合并后的值.
	 * 如果 urlQuery与formData中存在相同名称的参数,
	 * urlQuery上的值将被覆盖
	 */
	parseParams:function(cb){
		var params = {};
		var error = [];
		var me = this;
		
		me.parseQuery(function(err,queryParams){
			
			if(err){
				error.push(err); 
			}else{
				_extend(params,queryParams);
			}
			
			me.parseForm(function(err,queryParams){
				if(err && err.message != "request not a FormData"){
					error.push(err); 
				}else{
					_extend(params,queryParams);
				}
				
				if(error.length == 0){
					cb.call(me,null,depcle(params));
				}else{
					var msg = "parse failure because:";
					
					error.forEach(function(item){
						msg += "\n" + item.stack;
					});
					
					cb.call(me,new Error(msg),depcle(params));
				}
			});
		});
	},
	setHeader : function(k,v){
		if(typeof(k) == "string" && v){
			this.response.setHeader(k,v);
		}else if(typeof(k) == "object" && v == undefined){
			for(var key in k){
				this.setHeader(key,k[key]);
			}
		}else{
			log.warn("Unsupported parameter, [%s,%s]", k , v);
		}
	},
	/**
	 * 仅发送一个Expires的header.
	 */
	setExpires:function(t){
		
		/**
		 * 由于普遍情况下, 客户端之间及服务端都存在时间误差, expires并不能准确控制缓存.
		 * 所以应尽量使用 Cache-Control: max-age = xxx 来替换 Expires : xxxxxxx;
		 */
		log.dev("'the setExpires({Date})' is not recommend, please use the setMaxAge({int}).");
		
		var value = null;
		
		switch(typeof(t)){
			case "number" :
				value = new Date(Date.now() + t).toGMTString();
				break;
			case "string" :
				value = t
				break;
			case "object" :
				if(t instanceof Date){
					value = t.toGMTString();
					break;
				}
			default :
				throw new Error("Unsupported parameter");
		}
		
		this.setHeader("Expires",value);
	},
	/**
	 * 设置当前响应的最大缓存时间长,单位为秒;
	 * @param s {int} 客户端接收到响应后的缓存时长, 单位为秒.
	 */
	setMaxAge:function(s){
		if(typeof(s) == "number"){
			this.setHeader("Cache-Control","max-age=" + s);
		}else{
			throw new Error("Unsupported parameter");
		}
	},
	setNostore:function(){
		this.setHeader("Cache-Control","no-store");
	},
	setNoCache:function(){
		this.setHeader("Cache-Control","no-cache");
	},
	/**
	 * 发送一个http状态,并结束响应.
	 */
	sendStatus:function(code,msg,body){
	
		if(this.destroyd){
			log.warn("call send after the visitor destroyed!  \n\t " , (new Error()).stack);
			return;
		}
		
		this.response.writeHeader(code , msg);
		this.response.end(body || msg || "");
	},
	/**
	 * 发送一个错误到前端 , 
	 * 
	 * TODO : 目前只是将error对像的stack打印到前端, 
	 * 		  后续应该与error_handle关联在一起
	 */
	sendError:function(err,statusCode){
		
		statusCode = statusCode || 500;
		
		this.forward("error",{
			httpStatus : statusCode,
			errorCode : err.code,
			errorMsg : err.message,
			errorStack : err.stack
		});
	},
	/**
	 * 将一个内容发送到前端
	 * @parma contetn {string|buffer} 将发送的内容
	 * @param statusCode {int} http 状态码, 默认为 200
	 * @param contentType {String} meta-type值,默认为 "text/html"
	 * 
	 */
	sendContent:function(){
		this.send.apply(this,arguments);
	},
	send:function(content,statusCode,contentType,opts){
		var me = this;
        var req = this.request;
		var res = this.response;
		var compressType = '';
		
		opts = opts || contentType || statusCode || {};
		contentType = contentType || statusCode || "text/html";
		statusCode = statusCode || 200;
		
		statusCode = typeof(statusCode) == "number" ? statusCode: 200;
		contentType = typeof(contentType) == "string" ? contentType : "text/html";
		opts = typeof(opts) == "object" ? opts : {};
		
		//disable gzip，open chunk，for better user experience
		opts.gzip = opts.gzip || false;
	    opts.isChunk = !!opts.isChunk || true;
	    
	    opts.headers = opts.headers || {
	    	"Content-Type" : contentType
		};
		
		opts.onerror = opts.onerror || function(err){
			if(err.code == "ENOENT"){
			me.sendError(new Error("resource is no exists") , 404);
			}else{
				log.err(err.stack);
				me.sendError(err,500);
			}
			return;
		};
		
		//debugger;
        res.statusCode = statusCode || 200;
        
        me.setHeader(opts.headers);
        
    	//gzip && send 
		// 如果启用压缩,并且客户端支持压缩
		if(opts.gzip == true && (compressType = me.getCompressType()) != ""){
			
			me.setHeader("Content-Encoding", compressType);
			compressStream = me.getCompressStream();
			
			if(opts.isChunk){
				compressStream.pipe(res);
    		}else{
    			
    			var contentLength = 0, bufferArr = [];
    			
    			compressStream.on("data",function(chunk){
					contentLength += chunk.length;
					bufferArr.push(chunk);
				});
				
    			compressStream.on("end",function(){
					
					me.setHeader("Content-Length",contentLength);
					
					bufferArr.forEach(function(item){
						me.response.write(item);
					});
					
					me.response.end();
				});
    		}
			
			compressStream.end(content);
			
    	} else {
    		
    		if(!opts.isChunk){
    			res.setHeader("Content-Length",Buffer.byteLength(content));
    		}
    		
    		res.end(content);
    	}
	},
	/**
	 * 根据指定文件名称发送一个文件到前端
	 * 
	 * !!! WARNING !!!
	 * 未做路径限制,即如果执行权限够高,可以访问到系统内任意文件.
	 * 
	 * @parma fname {string} 路径及名称
	 * @param statusCode {int} http 状态码, 默认为 200, 找不到文件则404
	 * @param contentType {String} meta-type值,默认为 "text/html"
	 * 
	 */
	sendFile:function(fpath,statusCode,_opts){
		var me = this;

        var req = this.request;
        var res = this.response;

		var compressType = ''; 
		var targetWStream = res;	// 默认目标是 response
		var rstream;					// readableStream;
		 
        var opts = _opts || {};
        
        opts.gzip = opts.gzip || false;
        
        opts.isChunk = !!opts.isChunk || true;
        
        opts.headers = opts.headers || {
        };
        
        opts.onerror = opts.onerror || function(err){
        	if(err.code == "ENOENT"){
    			me.sendError(new Error("resource is no exists") , 404);
    		}else{
    			log.err(err.stack);
    			me.sendError(err,500);
    		}
    		return;
        };
        
       
        if(typeof(fpath)  == 'string'){
        	
        	// 按一个已打开的文件流处理
        	rstream = fs.createReadStream(fpath);
        	
        	// 文件名时才能猜的到mime类型
        	opts.headers["Content-Type"] = opts.headers["Content-Type"] || mime.lookup(fpath);
        	
        }else if(fpath instanceof stream.Readable){
        	
        	// 按路径处理
        	rstream = fpath;
        	opts.headers["Content-Type"] = opts.headers["Content-Type"] || "text/html";
        }else{
        	log.warn("type of fpath is,", typeof(fpath));
        	opts.onerror(new Error("fname mast be string or reableStream"));
        	
        	return;
        }
		
        rstream.on('error', function(err){
			opts.onerror(err);
		});
		
		opts.headers && me.setHeader(opts.headers);
		
		//debugger;
		// 如果启用压缩,并且客户端支持压缩
		if(opts.gzip == true && (compressType = me.getCompressType()) != ""){
			log.dev("send.gzip , file: %s", fpath);
			me.setHeader("Content-Encoding", compressType);
			
			if(opts.isChunk){
				// trunk下发
				targetWStream = me.getCompressStream(me.response);
			}else{
				// 不以trunk下发
				targetWStream = me.getCompressStream();
				var contentLength=0
				var bufferArr = [];
				
				// 不使用chunk下发时,在这里需要先计算content-length然后再向下写出.
				targetWStream.on("data",function(chunk){
					contentLength += chunk.length;
					bufferArr.push(chunk);
				});
				
				targetWStream.on("end",function(){
					
					me.setHeader("Content-Length",contentLength);
					log.info("big content-length: %d",contentLength);
					
					bufferArr.forEach(function(item){
						me.response.write(item);
					});
					
					//清空
					bufferArr.length = 0;
					
					me.response.end();
				});
			}
			
		}else{
			//无content-length时,node将自动使用 Transfer-Encoding : chunked
			if(!opts.isChunk){
				
				fs.stat(fpath,function(err,status){
					
					if(err){
						//  这里会和readablestream返回相同的错误. 在这里忽略错误.
						return;
					}else{
						res.setHeader("Content-Length",status.size);
					}
					
					res.statusCode = statusCode || 200;
					rstream.pipe(targetWStream);
				});
				
				return;
			}
		}
		res.statusCode = statusCode || 200;
		rstream.pipe(targetWStream);
	},
	/**
	 * 执行另一个action.
	 *  
	 * 转发成功反回true,否则返回false. 如果action中出现异常,将被抛出.
	 */
	forward:function(actionName,params){

		this.params = params;
		if(!this.currentRouter){
		    throw new Error("do not have any router.");
		}
		
		var action = this.currentRouter.__findActionByName(actionName);
		
		if(action){
			log.dev("Forward to Action [%s].",actionName);
			action.call(this, this.request, this.response, this.cachedExt);
			return true;
		}else{
			log.warn("call the nonexistent action [%s]" , name);
			return false;
		}
		
	},
	redirect:function(url,statcode){
		var res = this.response;
		statcode = statcode || 302;
		res.writeHead(statcode, {"Location":url});
		res.end();
	},
	/**
	 * 分片写出内容到前端. chunk.
	 */
	write:function(){
		//TODO IMPLEMENT THIS
		throw new Error("Not Implemented");
	},

    render: function(viewname, data, opts){
        return this.__tplEngine.render(viewname, data, opts);
    },

    renderStr: function(tpl, data, opts){
    	return this.__tplEngine.renderStr(tpl, data, opts);
    },

    lookup: function(url){
        return mime.lookup(url);
    },
    url : function(args, url){
    	return uri.apply(this, arguments);
    }
});

module.exports = ActionVisitor;