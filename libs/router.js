/**
 * Mapping to the Router;
 * 
 * @author wangsu01@baidu.com
 * @file router.js
 */
var format = require("util").format;
var inherits = require("util").inherits;
var _extend = require("util")._extend;
var EventEmitter = require("events").EventEmitter;
var Domain = require("domain");
var path = require('path');

var urlParse = require('url').parse;
var querystring = require('querystring');

var depcle = require("./lib.js").depcle;
var getFunArgs = require("./lib.js").getFunArgs;
var wildcardToReg = require("./lib.js").wildcardToReg
var randomStr = require("./lib.js").randomStr;

//var Chain = require("./chain.js");

var tplEngine = require("./views");

var isArray = Array.isArray;

var actions = {}, filters = {}, extensions = {};

var Chain = function(execArr){
    this._exec = execArr.slice(0);
}

Chain.prototype = {
    whenFinish:function(handle){
        this.onFinish = handle;
    },
    next:function(args){
        var me = this;
        args = args || [];
        var run = function(){
            var exec = me._exec.pop();
            if(exec){
                exec.apply(null,args);
            }else{
                me.onFinish && me.onFinish();
            }
        }
        args.push(run);
        run();
    }
}

/**
 *  已建立并mounte升效的RouterTree.
 *  key为各级prefix字符串组成.
 */
var RouterTree = {};

var joinPath = (function(slice){
    return function(){
        var rv = slice.call(arguments,0).join("/");
        return rv.replace(/\/+/g,"/");
    }
})(Array.prototype.slice);

var makeStartWith = function(str,withStr){
    if(str.indexOf(withStr) === 0 ){
        return str;
    }
    return withStr + str;
};

var makeEndWith = function(str,withStr){
    if(str.lastIndexOf(withStr) === str.length - 1){
        return str;
    }
    return str + withStr;
};

function countPath (str){
    var c = str.split("/").length;
    if(str[0] == "/")
        c--;
    if(str[str.length -1] == "/")
        c--;
    return c;
}

/**
 * 包装action与filter的原始方法,使所有可执行的内容具有统一的调用接口
 */
var packingShell = function(depends,handle){
    /**
     * 对action和filter的调用,将被包装为以下这种接口样式. 区别仅在于this上方法的传递,
     * filter上会有next方法,而action做为执行链的结束将没有这个方法.
     * 
     * @param req {IncomingMessage} httpserver中request事件的request对像.
     * @param res {ServerResponse} httpserver中的request事件的response对像.
     * @param cachedExt {Map} 在过滤链上时,已创建过的extension将被缓存到这个
     *      对像上,防止多次创建相同extension的运行开销及携带数据丢失.
     */
    return function(){
        var args = [];
        var lostExtensions = [];
        var me = this;
        var req = me.request,
            res = me.response,
            cachedExt = me.cachedExt;
        /*
         * 这里需要将extensions中缺少depends中所需的项目视为Unhandle,
         */
        var unhandlMsg = false;
        if(depends.length == 0 || depends.every(function(name){
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

var buildFilterHandle = function(item){
    
    // 如果未指定url,则认为匹配全部
    var url = wildcardToReg(item.url || /(.*)/);
    var exec , name = item.doFilter, params = item.params || {};
    var buildFilter;
     switch(typeof(name)){
        case "function":
            exec =  packingShell([],name);
            break;
        case "string":
            exec = filters[name];
            if(!exec){
                exec = name;
                log.info("waiting filter [%s], try again at request event", name);
            }
            break;
        default:
            throw new Error("type error: doFilter is not function or string! [" + typeof(filter) + "]");
    }
     
     buildFilter = function(url,handle,params){
         // real executable
         
         var rv = function(context,fullArr,next){
             var _handle, newErr;
             
             if(!url.test(context.pathInfo.rest)){
                 return next();
             }
             
             //debugger;
             context.next = next;
             context.params = depcle(params);
             context.urlPattern = url;
             
             // 使用call判断是否可执行.字符串不存在call,
             // 如果是对像并且存在call方法,则认为是其它包装过的可执行内容
             if(handle.call){
                 // 正常执行 filter
                 handle.call(context);
             }else if(_handle = filters[handle]){
                 /**
                  * 处理Filter delay
                  */
                 fullArr.some(function(item,index,fullArr){
                     if(item.waiting == handle){
                         fullArr[index] = buildFilter(url,_handle,params);
                         return true;
                     }
                 });
                 
                 _handle.call(context);
             }else{
                 // filter 还是找不到, 所以无法执行.直接抛异常;
                 
                 delete context.next;
                 delete context.params;
                 delete context.urlPattern;
                 
                 newErr = new Error("Filter [" + handle + "] is not exists!");
                 newErr.http_status = 404;
                 throw newErr;
             }
         }
         
         if(typeof(handle) == "string"){
             rv.waiting = handle;
         }
         
         return rv;
     };
     
    return buildFilter(url,exec,params);
}


var buildActionHandle = function(item){
    
    var url = wildcardToReg(item.url || /(.*)/);
    // 保证一定是一个可处理的handle对像
    var handle, value = null , params = item.params || {};
    var buildAction;
    /**
     * 按优先级判断handle，
     * 因为在配置文件中可以乱写，有可能一口气写好几个，
     * 所以这里由高至低定义优先级为：doAction -> http_status -> resource -> redirect
     * 发现任意一个，即忽略其它。
     * 所有的实现，最终全都是doAction实现,
     * http_status和redirect只是预定义的快捷方式
     */
    if(value = item.doAction){
        //debugger;
        switch(typeof(value)){
            case "function":
                handle =  packingShell([],value);
                break;
            case "string":
                handle = actions[value];
                if(!handle){
                    handle = value; 
                    log.info("waiting actions [%s], try again at request event", value);
                }
                break;
            default:
                throw new Error("type error: doAction is not function or string! [" + typeof(filter) + "]");
        }
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
    
    buildAction = function(url,handle,params){
        
        var rv = function(context){
            var _handle, newErr;
            
            if(!url.test(context.pathInfo.rest)){
                return false;
            }
            
            if(handle.call){
                context.params = depcle(params);
                context.urlPattern = url;
                handle.call(context);
                return true;
            }
            
            /**
             * 处理action delay
             */
            if(_handle = actions[handle]){
                _handle.call(context);
                return buildAction(url,_handle,params);
            }
            newErr = new Error("Action [" + handle + "] is not exists!");
            newErr.http_status = 404;
            return newErr;
        };
        
        // real executable
        return rv
    }
    
    return buildAction(url,handle,params);

};


var Router = function(opts){
    var me = this;
    /**
     * subs是优先级最高的处理链.
     * 每个项目由 / 开头. 其它的为Router自己的记录信息.
     */ 
    this.subs = {
        length:0,   //长度信息
        prefixes:[]    //排序后的prefix, 排序规则以路径深度为准,其判断方式为 / 的个数倒序.
    };
    /**
     * filter是第二优先, 
     * 只要派发进当前router的请求,都会经过filter链
     */
    this.filters = [];
    /**
     * action链是最终执行的业务处理链.
     * 如果不能处理也没有defaultAction,将被回抛给上级router.
     */
    this.actions = [];
    
    if(!(opts && (opts.map || opts.filters || opts.defaultAction))){
        throw new Error("Invalid argument, opts don't have any executable item , need one of 'mapping','filter','defaultAction'");
    }
    
    if(isArray(opts.filters) && opts.filters.length > 0){
        opts.filters.forEach(function(conf){
            this.filters.push(buildFilterHandle(conf));
        },this);
    }
    
    if(isArray(opts.mapping) && opts.mapping.length > 0){
        opts.mapping.forEach(function(conf){
            this.actions.push(buildActionHandle(conf));
        },this);
    }
    
    if(typeof(opts.defaultAction) == "string"){
        this.defaultAction = actions[opts.defaultAction];
        if(!this.defaultAction){
            this.defaultAction = (function(actionName,me){
                return function(){
                    me.defaultAction = actions[actionName];
                    if( me.defaultAction ){
                        me.defaultAction.apply(this,arguments);
                    }else{
                        throw new Error("Action ["+actionName+"] is not exists!");
                    }
                }
            })(opts.defaultAction,me);
        }
    }else{
        this.defaultAction = opts.defaultAction instanceof Function ? packingShell([],opts.defaultAction) : false;
    }
    
    if(typeof(opts.error) == "string"){
        this.error = actions [opts.error];
        
        if(!this.error){
            this.error = (function(actionName,me){
                return function(){
                    me.error = actions[actionName];
                    if( me.error ){
                        me.error.apply(this,arguments);
                    }else{
                        throw new Error("error handle [" + actionName + "] is not exists!");
                    }
                }
            })(opts.error,me);
        };
    }else if(opts.error instanceof Function){
        this.error = packingShell([], opts.error);
    }else{
        this.error = false;
    }
};

Router.prototype = {
    __findActionByName:function(name){
        if(name == "error" && this.error instanceof Function){
            return this.error;
        }else{
            return actions[name];
        }
    },
    __dispatchFilter:function(context,callback){
        var me = this;
        
        if(me.filters.length == 0){
            callback();
            return;
        }
        
        var fc = new Chain(me.filters,true);
        fc.whenFinish(callback);
        fc.next([context,me.filters]);
    },
    __dispatchSubRouter:function(context){
        
        var me = this, pathInfo, restPath, matched, sub;
        
        if(me.subs.length == 0){
            return false;
        };
        pathInfo = context.pathInfo;
        restPath = pathInfo.rest;
        
        if(me.subs.prefixes.some(function(prefixes){
            if(restPath.indexOf(prefixes) == 0){
                matched = prefixes; 
                return true;
            }
            return false;
        })){
            
            // -1 是为了使rest总是以 / 开头
            pathInfo.rest = restPath.substr(matched.length - 1);
            pathInfo.parentMatch.push(matched);
            
            sub = me.subs[matched];
            sub.dispatch(context,false);
            
            return true;
        }
        
        return false;
    },
    __dispatchAction:function(context){
        var me = this;
        
        if(me.actions.length != 0 && me.actions.some(function(exec,index,fullArr){
            var rs = exec(context);
            
            if(rs === true){
                return true;
            }
            
            if(rs === false){
                return false;
            }
            
            if(typeof(rs) == "function"){
                fullArr[index] = rs;
                return true;
            }
            
            if(rs != undefined){
                throw rs;
            }
            
            return false;
        })){
            return true;
        }
        
        if(me.defaultAction){
            me.defaultAction.call(context);
            return true;
        }
        
        return false;
    },
    // 派发请求
    dispatch:function(context,isReverse){
        //debugger;
        var me = this;
        var parentRouter = context.currentRouter;
        var pathInfo = context.pathInfo;
        context.currentRouter = me;
        var dispatchParent = function(){
             pathInfo.rest = joinPath(pathInfo.rest, pathInfo.parentMatch.pop());
             
             if(parentRouter){
                 parentRouter.dispatch(context,true);
             }else{
                 context.emit("error",new Error("can't dispatch the request [" + context.req_pathname + "]"));
             }
        }
        
        if(isReverse){
            
            if(me.__dispatchAction(context)){
                return; 
             }
            
            return dispatchParent();
        }
        
        me.__dispatchFilter(context,function(err){
                    
            if(err){
                context.emit("error",err);
                return;
            }
                       
            if(me.__dispatchSubRouter(context)){
                return;
            }
                       
            if(me.__dispatchAction(context)){
               return; 
            }
            
            return dispatchParent();
        });
      
    },
    // 挂载子router
    mount : function(prefix,sub){
        var subs = this.subs;
        if(! typeof(prefix) == "string"){
            throw new Error("prefix must be a string");
        }
        
        if(! sub instanceof Router){
            throw new Error("sub must be a instance of Router");
        }
        
        prefix = makeStartWith(makeEndWith(prefix,"/"),"/");   // 只配置整级路径,即最后一个字符必须是 / ;
        
        if(subs[prefix]){
            log.warn("replace sub router prefix[%s]", prefix);
        }else{
            subs.prefixes.push(prefix);
            subs.prefixes.sort(function(a,b){
                var al = countPath(a);
                var bl = countPath(b);
                if(al > bl){
                    return -1;
                }else if(al < bl){
                    return 1;
                }else{
                    return 0;
                }
            });
            subs.length = subs.prefixes.length;
        }
        
        subs[prefix] = sub;
    }
};

Router.defineAction = function(name, depends, handle){
    
    if(typeof(name) != "string"){
        throw new Error("Invalid argument, name is not a string!");
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
    
    actions[name] = packingShell(depends,handle,extensions);
};

Router.defineFilter = function(name, depends, handle){
    if(typeof(name) != "string"){
        throw new Error("Invalid argument, name is not a string!");
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

Router.defineExtension = function(name, handle){
    
    if(typeof(name) != "string"){
        throw new Error("Invalid argument, name is not a string!");
        return;
    }
    
    if(extensions[name]){
        log.info("httpd:redefined the Extension [%s]" , name);
    }else{
        log.info("httpd:defined Extension [%s]" , name);
    }
    
    extensions[name] = handle;
};

module.exports = Router;