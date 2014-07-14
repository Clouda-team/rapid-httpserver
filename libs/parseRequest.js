/**
 * 用于解析request中所携带的参数.
 * 包含url, form两项. 
 */
var urlParse = require('url').parse;
var depcle = require("../libs/lib.js").depcle;

var isPost = /^post$/i;

var exports = function(req,res){
	
	var rv = {
		__parsed:false,
		__waiting:[],
		__url:{},
		__form:{},
		params:{},
		parse:function(cb){
			if(this.__parsed){
				cb && cb(depcle(this.params));
			}else{
				this.__waiting.push(cb);
			}
		}
	};
	
	var url = req.url;
	var urlObj = urlParse(req.url, true);
	var params = urlObj.query; //parseUriParam(urlObj.query);
	var contentLen , formContent;
	
	
	rv.__url = params;
	
	for(var key in params){
		rv.params[key] = params[key];
	}
	
	if(isPost.test(req.method) && req.headers["content-type"] == "application/x-www-form-urlencoded" && (contentLen = req.headers["content-length"]) > 0 ){
		//FIXME 暂时就是UTF8,爱咋咋地...留配置是以后的事情,暂时没时间..thanks!!!
		req.setEncoding("utf-8");
		req.on("readable" , function(){
			var str = req.read(contentLen);
			var formObj = urlParse("?" + str,true);
			var cb;
			rv.__form = formContent = formObj.query || {};
			
			for(var key in formContent){
				rv.params[key] = formContent[key];
			}
			
			rv.__parsed = true;
			
			while(rv.__waiting.length > 0){
				cb = rv.__waiting.pop();
				cb && cb(depcle(rv.params));
			}
			
		});
		
	}else{
		console.dir(req.headers);
		log.dev("pase from ,but the method is %s, contentType is %s ,content-length is %s",req.method, req.headers['content-type'], contentLen);
	}
	
	return rv;
}

module.exports = exports;