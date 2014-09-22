var http = require('http');
var fs = require('fs');
var path = require('path');
var format = require("util").format;
var _extend = require("util")._extend;
var EventEmitter = require("events").EventEmitter;

var ActionVisitor  = require("./libs/actionVisitor.js");
var Router  = require("./libs/router.js");
var tplEngine = null;

var defineAction = Router.defineAction,
    defineFilter = Router.defineFilter,
    defineExtension = Router.defineExtension;

var isArray = Array.isArray;

var server = false , httpd = null , port , conf = {mapping:[], filter:[]} , appName = "";

/**
 * httpserver的处理,不在router中,而是在router之上,
 * 直接在superAction中被拦截.用来减小router的复杂度.
 */
var services = [];

var rootRoter = null;

var dispatchServices = function(req,res,head){
    //dispatch services
    if(services.some(function(handle){
            try{
                return handle(req,res,head);
            }catch(e){
                log.err(e.stack);
                res.statusCode = 500;
                res.end(e.stack);
                // 遇到crash不再继续;
                return true;
            }
    })){
            // process by service, return.
            return true;
    }
    return false;
}

var superActions = function (req, res) {
    var context, dispatch;
    log.dev("%s %s " ,req.method, req.url);
    
    /**
     * 首先尝试services派发
     */
    if(dispatchServices(req,res)){
    	    return;
    }
    
    if(rootRoter){
//        debugger;
        context = new ActionVisitor(req,res,tplEngine);
        dispatch = context.domain.bind(rootRoter.dispatch);
        dispatch.call(rootRoter,context);
    }else{
        res.end("server not ready!");
    }
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
	        
			/**
			 * 直接将config中的内容处理为root router.
			 */
			if((!isArray(conf.mapping) || conf.mapping.length == 0) && conf.defaultAction == undefined){
				log.warn("httpserver : no action , unable to work!!");
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
			
	        rootRoter = new Router({
	            filters:conf.filters || false,
	            mapping:conf.mapping || false,
	            /*
	             * 默认的错误处理名称为 error,
	             * 当未配置时,自动在定义的action列表中查找名称为error的action
	             */
	            error : conf.errorAction || "error",
	            defaultAction:conf.defaultAction || function(){
	                var err = new Error("defaultAction not found!!");
	                this.sendStatus(500, err.message);
	            },
	        });
	        
	        tplEngine = (function buildTplEngine(tplEngine){
	            try{
	                var enginePath;
	                if(!tplEngine){
	                    return require("./libs/views");
	                }
	                
	                switch(typeof(tplEngine)){
	                    case "string" :
	                        enginePath = path.join(ROOT_DIR,tplEngine)
	                        log.info("httpd : load template engine from : %s" ,enginePath);
	                        return require(enginePath);
	                    case "object" :
	                        if(tplEngine.render && tplEngine.renderStr){
	                            return tplEngine;
	                        }
	                    default:
	                        throw new Error("Invalid : config.tplConf.engine, use default : /libs/views.js");
	                }
	                
	            }catch(e){
	                log.warn(e.stack);
	                return require("./libs/views");
	            }
	        })(conf.tplConfig && conf.tplConfig.engine);
	        
	        tplEngine.conf && tplEngine.conf(conf.tplConfig);
			
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
	     * 以下为以编程的方式扩展httpserver的一组接口, 
	     * 每次使用同一个prefix时,将覆盖之前的配置.
	     * 
	     * @param prefix {string} 将router应用到那一个前缀以下
	     * @param router {JSON} 一个具有指定格式的JSON对像.
	     * 
	     */
	    mount:function(prefix,router){
	        if (!(router instanceof Router)) {
	            router = new Router(conf);
	        }
	        return rootRoter.mount.apply(rootRouter,arguments);
	    },
	    createRouter:function(conf){
	        return new Route(conf);
	    },
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
	    // 几个短名称的快捷方式, 直接调用 defineXXXXXX.
	    action:function(){
	    	    defineAction.apply(this,arguments);
	    },
	    filter:function(){
	        defineFilter.apply(this,arguments);
	    },
	    extension:function(){
	        defineExtension.apply(this,arguments);
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
