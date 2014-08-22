/**
 * 实现一个单向的可执行的链结构.
 * 
 * @author wangsu01@baidu.com
 */
var _extend = require("util")._extend;
var EventEmitter = require("events").EventEmitter;

var Chain = function(execItems,async){
    
    if(!(this instanceof Chain)){
        return new Chain(execItems, async, bind);
    }
    
    EventEmitter.call(this);
    
    var execs = [] , index = 0;
    this.__execs = execs;
    this.__async = !!async;
    this.index = 0;
    
    // 错误标记,当发生错误时,标记为true.
    this.hasError = false;
    // 正在处理中标记, 当调next时,置为true
    this.processing = false;
    
    /**
     * 检查execIems是否都是function
     */
    if(!Array.isArray(execItems)){
        throw new Error("Invalid arguments, execItems must be an array");
    }else if(!execItems.every(function(item,index,full){
        if(item instanceof Function){
            execs.push(item);
            return true;
        }
        return false;
    })){
        throw new Error("Invalid arguments, not all item is function");
    }
    // 记录全长
    this.length = execs.length;
    
    // 区分处理异步与同步
    if(this.__async){
        // 异步
        this.next =  (function(me){
            return function(_args,bind,__fromInternal){
                var exec,args = null;
                me.processing = true;
                if(exec = this.__execs[this.index++]){
                    
                    // 内部调起,不再添加callbakc
                    if(!__fromInternal){
                        args = Array.isArray(_args) ? _args.slice(0) : [_args];
                        var cb_async = (function(me,args,bind){
                            return function(err){
                                if(err){
                                    me.emit("error",err);
                                }else{
                                    me.next(args,bind,true);
                                }
                            };
                        })(me,args,bind);
                        args.push(cb_async);
                    }else{
                        args = _args;
                    }
                    
                    setImmediate(function(exec,args,bind){
                        try{
                            exec.apply(bind,args);
                        }catch(e){
                            me.emit("error",e);
                        }
                    },exec,args,bind);
                    
                }else{
                    me.emit("finish");
                }
                
                return me;
            };
        })(this);
    }else{
        // 同步
        this.next =  (function(me){
            return function(_args,bind){
                me.processing = true;
                var exec, args = Array.isArray(_args) ? _args : [_args];
                if(exec = this.__execs[this.index++]){
                    // 增加回调
                    setImmediate(function(exec,args,bind){
                        try{
                            exec.apply(bind,args);
                            me.next(_args,bind);
                        }catch(e){
                            me.emit("error",e);
                        }
                    },exec,args,bind);
                    
                }else{
                    me.emit("finish");
                }
                return me;
            };
        })(this);
    }
    this.on("finish",function(){
        //console.log("finish");
        setImmediate(function(me){
            me.destroy();
        },this);
    });
    
    /**
     * 错误自动销毁动作, 
     * 即在发生错误时,如果在下一个时间片内,没有重新调起执行, 则自动销毁.
     */
    this.on("error",function(err){
        //console.log("trying to destroy");
        this.hasError = true;
        this.processing = false;
        
        /*
         * wait a minute let the customer handle error, 
         * after that to call the 'destroy', if no call the 'next';
         */
        setImmediate(function(me){
            if(me.hasError == true && me.processing == false){
                me.destroy();
            }
        },this);
        
        /*
         *  if only this one handle the error , 
         *  throw the error to the parent domain;
         */
        if(this.listeners("error").length == 1){
            throw err;
        }
    });
};

Chain.prototype = _extend(Object.create(EventEmitter.prototype),{
    /**
     * 表示完成,
     */
    whenFinish:function(handle){
        this.on("finish",handle);
        return this;
    },
    /**
     * 表示停止,发生错误等情况,如果继续调next还可以继续.否则将停止
     */
    whenError:function(handle){
        this.on("error",handle);
        return this;
    },
    destroy:function(){
        // console.log("destroy");
        this.__execs.length = 0;
        this.removeAllListeners('error');
        this.removeAllListeners('finish');
        
        delete this.__execs;
        delete this.__async;
        delete this.index;
        delete this.next;
    }
});

module.exports = Chain;