var http = require('http');
var fs = require('fs');
var path = require('path');
var format = require("util").format;
var _extend = require("util")._extend;
var EventEmitter = require("events").EventEmitter;

var urlParse = require('url').parse;
var querystring = require('querystring');

var depcle = require("./libs/lib.js").depcle;
var getFunArgs = require("./libs/lib.js").getFunArgs;
var wildcardToReg = require("./libs/lib.js").wildcardToReg
var randomStr = require("./libs/lib.js").randomStr

var ActionVisitor  = require("./libs/actionVisitor.js");
var tplEngine = require("./libs/views");

var isArray = Array.isArray;

var server = false , httpd = null , conf = {mapping:[], filter:[]} , appName = "";


/**
 * 以下在一个为组织定义的action,extension,filter的原始工厂方法的三个map对像.
 */
var actions = {}, extensions = {} , filters = {} , services = [];


var mappingChain = [];
var filterChain = [];

var port;

var getReqPath = function(url){
	return urlParse(url).pathname;
}

var dispatchServices = function(req,res,head){
	//dispatch services
    if(services.some(function(handle){
    	return handle(req,res,head);
    })){
    	// process by service, return.
    	return true;
    }
    return false;
}

var superActions = function (req, res) {
    
    log.dev("%s %s " ,req.method, req.url);
    
    if(dispatchServices(req,res)){
    	return;
    }
    
    //debugger;
    var visitor = new ActionVisitor(req,res,tplEngine);
    
    // addition
    visitor.req_pathname = getReqPath(req.url);
    
    visitor.__filterIndex = 0;
    
    visitor.next = function(){
    	try{
    		var exec;
    		var item = filterChain[this.__filterIndex];
    		if(item){
    			// 处理filter延迟载入
    			if(item instanceof Function){
    				exec = item;
    			}else{
    				exec = buildFilterHandle(item);
    				if(exec instanceof Function){
    					filterChain[this.__filterIndex] = exec;
    				}else{
    					exec = (function(url,name){
							
							url = wildcardToReg(url);
							
							// 还是找不到action定义, 向客户端返回错误
							return function(req){
								if(url.test(this.req_pathname)){
									this.sendError(new Error("filter [" + name + "] not find!!"),404);
									return true;
								}
								return false;
							}
						})(item.url || /.*/, item.doFilter);
    				}
    			}
    			this.__filterIndex++;
    			exec.call(this,this.request,this.response);
    		}else{
    			delete this.next;
    			delete this.__filterIndex
    			
    			var me = this;
    			
    			var checked = mappingChain.some(function(item,index,chain){
    				var exec;
    				if(item instanceof Function){
    					// 已编译成可执行的action
    					exec = item;
    				}else{
    					// 重试编译过程.
    					exec = buildActionHandle(item);
    					
    					if(exec instanceof Function){
    						
    						// 替换mappingChain上的配置对像为可执行对像
    						chain[index] = exec;
    						
    					}else{
    						// 如果仍然找不到actin, 则向客户端返回错误
    						exec = (function(url, name){
    							
    							url = wildcardToReg(url);
    							
    							// 还是找不到action定义, 向客户端返回错误
    							return function(req){
    								if(url.test(this.req_pathname)){
    									this.sendError(new Error("action [" + name + "] not find!!"),404);
    									return true;
    								}
    								return false;
    							}
    							
    						})(item.url || /.*/gm, item.doAction);
    					}
    				}
    				
    				return exec.call(me,req,res);
    				
    			});
    			
    			// checked == false的时候,表示请求未被处理
    			if(!checked){
    				throw new Error("Unhandle Exception :unfinished request , because no action cat process the request [%s] , check the conf.mapping." , req.url);
    			}
    		}
    		
    	}catch(e){
    		this.sendError(e);
    		log.err(e.stack);
    	}
    };
    
    visitor.next();
    
    res.on("finish",function(){
    	visitor.__destroy();
    });
};

/**
 * extension是最简单最原始的,所有的handle采用统一的接口样式,
 * 即接收req,res,并返回一个可操作的对像.如下:
 * 
 * 	var some_extension = module.exports = function(req,res){
 * 		// do some thing....
 * 		return {
 * 			foo:function(){
 * 				//dosometing with the req and the res
 * 				req.xxx;
 * 				res.xxxx();
 * 			},
 * 			bar:function(){
 * 				//dosometing with the req and the res
 * 				res.xxxx;
 * 			}
 * 		};
 *  }
 *  
 *  !!! 每个extension 应该量不要重名, 因为重名时会直接被覆盖.
 */
var defineExtension = function(name,handle){
    if(extensions[name]){
        log.info("httpd:redefined the Extension [%s]" , name);
    }else{
        log.info("httpd:defined Extension [%s]" , name);
    }
    
    extensions[name] = handle;
};

/**
 * 包装action与filter的原始方法,使所有可执行的内容具有统一的调用接口
 */
var packingShell = function(depends,handle,extensions){
	/**
	 * 对action和filter的调用,将被包装为以下这种接口样式. 区别仅在于this上方法的传递,
	 * filter上会有next方法,而action做为执行链的结束将没有这个方法.
	 * 
	 * @param req {IncomingMessage} httpserver中request事件的request对像.
	 * @param res {ServerResponse} httpserver中的request事件的response对像.
	 * @param cachedExt {Map} 在过滤链上时,已创建过的extension将被缓存到这个
	 * 		对像上,防止多次创建相同extension的运行开销及携带数据丢失.
	 */
	return function(req,res,cachedExt){
		var args = [];
		var lostExtensions = [];
		var me = this;
		/*
		 * 这里需要将extensions中缺少depends中所需的项目视为Unhandle,
		 */
		var unhandlMsg = false;
		if(depends.every(function(name){
			var value;
			
			// 优先从缓存中取值
			if(value = cachedExt[name]){
				args.push(value);
				return true;
			}else{
				value = extensions[name];
				/**
				 * extension 不执行业务逻辑,所以不传入this对像, 这种设计主要为了保证extension只能使用req与res两个标准对像
				 */
				return value ? (args.push(cachedExt[name] = value.call({},req,res)),true) : (lostExtensions.push(name),false);
			}
			
		})){
			// depends 完整, 执行handle
			handle.apply(me, args);
			//return by process ok!  any exception will be throw;
			return; 
		}else{
			// 缺少必要的extension.异常
			unhandlMsg = format("Unhandle Exception : missing extension [%s] , ignore the request." , lostExtensions.join(","));
		}
		
		// 这里抛出错误,是为了扔给superAction统一处理; 为方便增加Error_handle
		throw new Error(unhandlMsg);
		
	}
};

/**
 * 定义action, 
 * 
 * 每个action在定义过程中被包装为一个固定接口样式的function.接口样式为接收req,res,cachedExts
 * 整个方法没有返回值.(原设计中考虑使用返回值做为http返回,但由于node的异步风格的原因无法实现,所
 * 以在action中应直接操作response或response的返回值来完成向客户端返回的操作实现).
 * 
 * !!! 同名的action将被覆盖.
 * 
 * @param name {string} action的名称
 * @param depends {array} 一组依赖的名称,可以不提供,当不提供时,则扫描handle的参数列表并根据
 * 		参数列表的名称自动填充所需的依赖
 * @param handle {function} 实际执行的action动作.
 */
var defineAction = function(name,depends,handle){
    
	if(typeof(name) != "string"){
		throw new Error("call defineAction with wrong arguments, " + name);
		return; 
	}
	
    if(actions[name]){
        log.info("httpd:redefined the action [%s]" , name);
    }else{
        log.info("httpd:defined action [%s]" , name);
    }
    
    if(!handle){
    	handle = depends;
    	depends = [];
    }
    
    // depends 检测. 如果未指定, 则扫描handle的参数列表
    if(!isArray(depends) || !depends.length > 0){
        depends = [];
        
		/**
		 * handle有可能无参数. 
		 */
        if(handle.length > 0){
            var params = getFunArgs(handle);
            if(params.length == handle.length){
                depends = params;
            }
        }
    }

	/**
	 * 不为0同样可能无处理,所以其实没办法通过depends的数量判断是否可以完成response的处理.
	 * 因此在这里取消这个depends.length == 0 的判断,做为无法操作response的补充, 
	 * 将在执行action的方法时,在this对像上放置两个用来取得原始req与res的方法或几个常用的
	 * 包装方法似乎是更优的实现方式. 并且可以考虑将默认的几个extension中使用频率最高的几个,
	 * 以这种方式进行默认附加.(会增加执行成本,但是会减少复杂度.)
	 * 
	 * TODO: 调用action处,在this中增加取得req与res的方法和常用的http返回方法.
	 */
// 	  depends为0,直接认为没办法继续; 
//    if(depends.length == 0 ){

//    	actions[name]  = (function(unhandlMsg){
//    		log.warn(unhandlMsg);
//    		// 这里抛出错误,是为了扔给superAction统一处理; 为方便增加Error_handle
//            throw new Error(unhandlMsg);
//    	})("Unhandle Exception : action [" + name + "] can not response");
//    	
//    }else{
    
    	actions[name] = packingShell(depends,handle,extensions);
    	
    //}
    
};

/**
 * 定义一个filter;
 */
var defineFilter = function(name, depends, handle){
	
	if(typeof(name) != "string"){

		throw new Error("call defineFilter with wrong arguments");

		return; 
	}
	
    if(filters[name]){

        log.info("httpd:redefined the filter [%s]" , name);

    }else{

        log.info("httpd:defined filter [%s]" , name);

    }
    
    if(!handle){
    	handle = depends;
    	depends = [];
    }
    
    // depends 检测. 如果未指定, 则扫描handle的参数列表
    if(!isArray(depends) || !depends.length > 0){
        depends = [];
		/**
		 * handle有可能无参数.
		 * filter可以没有任何参数..直接调用也行.因为的确有可能什么都不做.
		 */
        if(handle.length > 0){
            var params = getFunArgs(handle);
            if(params.length == handle.length){
                depends = params;
            }
        }
    }
    
    filters[name] = packingShell(depends,handle,extensions);
};

var loadDefault = function(targetDir,type,doDefine){
	var fullDir, reg_isJsFile = /(.+)\.js/i;
    if(targetDir[0] != "/"){
        fullDir = path.join(__dirname, targetDir);
    }else{
        fullDir = path.join(ROOT_DIR , targetDir);
    }
    
    /*
     * 这里由于是启动过程中,所以直接使用同步处理
     */
    if(fs.existsSync(fullDir)){
        var afs = fs.readdirSync(fullDir);
        afs.forEach(function(fname){
            try{
                var parts = reg_isJsFile.exec(fname) , fullPath , handle;
                if(parts){
                    
                    log.dev("httpd:load %s [%s]" ,type, fname);
                    
                    fullPath = path.join(fullDir,fname);
                    handle = require(fullPath);
                    
                    /**
                     * 如果载入的文件本身只是一个function,那么从文件名拆出名称.
                     * 如果载入的文件是一个具有name与handle的对像,那么直接使用
                     * 指定的名称和handle.
                     * 如果不满路以上两个条件,则进行忽略处理.
                     */ 
                    if(handle instanceof Function){
                    	doDefine(parts[1],false,handle);
                    }else if(handle.handle instanceof Function){
                    	doDefine(handle.name || parts[1] , handle.depends, handle.handle);
                    }else{
                        log.warn("httpd:failed to load %s, because the [%s] is not a function or an object for define %s",type,fullPath,type);
                    }
                }
            }catch(e){
                setTimeout(function(){
                    log.err("%s, at require file: %s",e.stack , fullPath);
                },1);
            }
        });
    }else{
        log.warn("this directory is not exists, [%s]", fullDir);
    }
}


var buildFilterHandle = function(item){

	var name = item.doFilter, params = item.params || {};
	// 如果定url,则认为匹配全部
	var url = item.url ? wildcardToReg(item.url) : {test:function(){return true;}};
	
	// 在此以后都使用处理过的url.
	item.url = url;
	
	var exec = filters[name];
	
	if(!exec){
		log.info("can not find filter [%s], try again at request event", name);
		//需要在执行时重新检测filter是否存在, 慢速处理
		return item;
	}else{
		
		// 创建一个闭包, 快速处理
		return (function(url,exec,params){
			
			return function(req,res){
				// url匹配,进行处理
				if(url.test(this.req_pathname)){
					// 设置conf为当前的filter的配置
					this.params  = depcle(params);
					this.urlPattern = url;	//添加匹配url正则对像.便于从url中取值.
					exec.call(this,req,res,this.cachedExt);
				}else{
					// 跳过处理,直接下一个
					this.next();
				}
			}
			
		})(url,exec,params);
	}
}

var buildFilter = function(filtersConf){
	if(isArray(filtersConf)){
		
		// 每次build时,清空已有的..
		filterChain.length = 0;
		
		/**
		 * TODO : 后续这里需要增加一些优化操作.暂示处理
		 */
		filtersConf.forEach(function(item){
			filterChain.push(buildFilterHandle(item))
		});
	}
}


/**
 * buildActionHandle中不使用callAction来执行action，而是直接使用闭包来快速执行.
 * 如果固定挂载到指定URL的ACTION应该通过buildActionHandle来处理，在其它位置对action的
 * 临时调用才使用callAction
 */
var buildActionHandle = function(item){

	
	/**
	 * 两种模式，通配符或正则，除非直接给正则，否则一概认为是字符串通配符.
	 * 最终保证url一定为正则对像
	 */
	var url = item.url ? wildcardToReg(item.url) : {test:function(){return true;}};
	
	// 在此以后都使用处理过的url.
	item.url = url;
	
	// 保证一定是一个可处理的handle对像
	var handle, value = null , params = item.params || {};
    
    /**
     * 按优先级判断handle，
     * 因为在配置文件中可以乱写，有可能一口气写好几个，
     * 所以这里由高至低定义优先级为：doAction -> http_status -> resource -> redirect
     * 发现任意一个，即忽略其它。
     * 所有的实现，最终全都是doAction实现,
     * http_status和redirect只是预定义的快捷方式
     */
    if(value = item.doAction){
        handle = actions[value];
    }else if(value = item.http_status){
        handle = actions['http_status'];
        // 附加参数
        params.code = value.code;
        params.msg = value.msg;
        params.body = value.body;
    }else if(value = item.resource){
        handle = actions['resource'];
        params.dst_path = value;
    }else if(value = item.redirect){
    	handle = actions['redirect'];
    	params.url = value;
    }
    
    // 创建代理方法，使后续访问直接调用处理函数
    if(handle instanceof Function){
    	
    	return (function(url,handle,params){
    		/**
    		 * 这里返回一个只接收req与res的方法.
    		 * params将则闭包进行传值.
    		 */
    		return function(req,res){
    			if(url.test(this.req_pathname)){
    				this.params = depcle(params);
    				this.urlPattern = url;	//添加匹配url正则对像.便于从url中取值.
    				handle.call(this,req, res,  this.cachedExt);
    				return true;
    			}
    		}
    		
    	})(url,handle,params);
    	
    }else{
    	// can not handle.
    	/**
    	 * 解决action载入延迟, 即配置中存在,但action尚未载入的问题.
    	 */
    	log.info("can not find action [%s], try again at request event", value);
    	return item;
    }
    
    //throw new Error("action [" + value +"] not define, please check the configure");
};

var buildMapping = function(mappingConf){
	if(isArray(mappingConf)){
		mappingChain.length = 0;	//清空,每次重新生成mappingChain
		
		mappingConf.forEach(function(item){
			
			/**
			 * 当item直接为一个function时,
			 */
			var name ;
			if(item instanceof Function){
				name = randomStr(10) + "_" + (Date.now()).toString(16);
				defineAction(name,item);
				item = {doAction:name};
			}else if(item instanceof String){
				item = {doAction:item};
			}else if(item.doAction instanceof Function){
				name = randomStr(10) + "_" + (Date.now()).toString(16);
				defineAction(name,item.doAction);
				item.doAction = name;
			}
			
			mappingChain.push(buildActionHandle(item));
		});
	}
};
httpd = _extend(new EventEmitter(),{
		/**
		 * 启动httpserver
		 */
		start : function(_conf){
			
			if(server){
				log.warn("ignore call the httpd.start() after the server runing");
				return;
			}
			
			if(_conf){
				// 合并参数;
				for(var key in _conf){
					conf[key] = _conf[key];
				}
				
				/**
				 * 这将合并后的conf对像,重新进行定义rapid-httpserver.
				 * 并重新利用config的watch行为启动server
				 */
				conf.autoStart = true;
				rapid.config.define("rapid-httpserver",conf);
				return;
			}
			
	        
			if((!isArray(conf.mapping) || conf.mapping.length == 0) && conf.defaultAction == undefined){
				log.warn("httpserver : no action configure, unable to work!!");
			}
			
			/**
			 * 
			 * 默认载入行为移动至由definedplugin中移动到start中,是为让默认载入的内容,可以找到定义的conf
			 * 
			 */
			//默认的extensions
			loadDefault("./extension",'extension',function(a,b,c){
				defineExtension(a, c || b);
			});
			
			// 默认action
			loadDefault("./default_action","action",defineAction);
			
			// 默认filter
			loadDefault("./filter",'filter',defineFilter);
			
	        //自定义内容的载入位置
	        if(isArray(conf.loading_dir)){
	        	conf.loading_dir.forEach(function(dir){
	        		rapid.requireDir(dir);
	        	});
	        }
	        
	        port = conf.port || 8080;
			
			/*
			 * 每次变更配置或操作都应该会触发buildFilter与buildMapping,
			 * 但是由于从start方法中变更配置会影响其它不应反复改变的配置,
			 * 如端口等,所以在start方法中,一旦server启动就完全忽略后续调
			 * 用start对配置的改变, 为此,mapping与filter两个链的定义,
			 * 必须先于启动,但为了处理异步执行可能造成的action与filter的
			 * 定义的延迟,整个http-server支持先使用,后定义的方式来处理访
			 * 问到达时,action与filter还未定义的问题,系统会先对未找到fil-
			 * ter的请求返回一个服务端错误.
			 */
			buildFilter(conf.filter);
			
			// default action
			conf.mapping = isArray(conf.mapping) ? conf.mapping : [];
			
			conf.mapping.push(conf.defaultAction || function(){
				var err = new Error("defaultAction not found!!");
				this.sendStatus(500, err.message);
			});
			
			buildMapping(conf.mapping);
			
			tplEngine.conf(conf.tplConfig);
			
	        server = http.createServer(superActions);
	        server.on("upgrade",dispatchServices);
	        
	        server.listen(port , function(){
	            log.info("%s http server start runing, on port %d...", appName, port);
	            httpd.emit("start",server);
	        });
		},
		addService : function(handle){
			
		    var reg = /\n\s*/g;
		    var err = {} , stack;
		    Error.captureStackTrace(err, arguments.callee);
		    stack = err.stack;
		    stack = stack.split(reg);
		    stack.splice(0,1);
			
			log.info("one service be add on, %s" , stack);
			
			var index = services.indexOf(handle);
			if(index == -1){
				services.push(handle);
				return true
			}
			return false;
	    },
	    removeService : function(handle){
	    	var index = services.indexOf(handle);
	    	if(index!= -1){
	    		return services.splice(index,1);
	    	}
	    	return false;
	    },
	    /**
	     * 以下为以编程的方式扩展httpserver的一组接口
	     */
	    /**
	     * 添加一个action.
	     */
	    defineAction : function(name,depends,handle){
	    	defineAction.apply(httpd,arguments);
	    },
	    /**
	     * 添加一个Extension
	     */
	    defineExtension : function(name,handle){
	    	defineExtension.apply(httpd,arguments);
	    },
	    /**
	     * 添加一个filter
	     */
	    defineFilter : function(name,depends,handles){
	    	defineFilter.apply(httpd,arguments);
	    },
	    __findActionByName:function(name){
	    	return actions[name];
	    }
});


rapid.plugin.define("rapid-httpserver",['rapid-log'],function(log,cb){
	
    if(server){
        return;
    }
	
    appName = rapid.resource.appName || "clouda+";
    
	log.info("Initialize rapid Http Server...");
	
    cb && cb(null,httpd);
    
    rapid.config.watch('rapid-httpserver',function(_conf){
    	
    	if(server){
    		log.warn("ignore the configure change after the http server started.");
    		return;
    	}
    	
    	if(conf){
    		log.info("overwrite the configure of rapid-httpserver before the server start;");
    	}
    	
    	conf = _conf;
    	
        setImmediate(function(){
        	if(!conf.autoStart){
        		log.info("httpd.conf.autoStart is false,  Waiting the httpd.start()");
        	}else{
        		log.info("httpd.conf.autoStart is true, self-acting the httpd.start()");
        		httpd.start();
        	}
        });
    },true);

});
