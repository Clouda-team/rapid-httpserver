/**
 * 实现一个单向的可执行的一次性的链结构.
 * 
 * @author wangsu01@baidu.com
 */
var _extend = require("util")._extend;
var EventEmitter = require("events").EventEmitter;

var Chain = function(execItems,async){
    
    if(!(this instanceof Chain)){
        return new Chain(execItems, async);
    }
    
    EventEmitter.call(this);
    
    this.__execs;
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
    } else if(!execItems.every(function(item,index,full){
        return item instanceof Function;
    })){
        throw new Error("Invalid arguments, not all item is function");
    }
    
    this.__execs = execItems.slice().reverse();
    // 记录全长
    this.length = this.__execs.length;
    
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
        this.hasError = err;
        this.processing = false;
        
        /*
         *  if only this one handle the error , 
         *  throw the error to the parent domain;
         */
        if(this.listeners("error").length == 1){
            if(this.domain){
                this.domain.emit("error",err);
            }else{
                throw err;
            }
        }else{
            /*
             * wait a minute let the customer handle process the error, 
             * after that to call the 'destroy', if no call the 'next';
             */
            this.__errDelay = setImmediate(function(me){
                // 通知完成,如果因为错误停止,携带错误对像;
                me.end(err);
            },this);
        }
    });
};

Chain.prototype = _extend(Object.create(EventEmitter.prototype),{
    ASYNC:true,
    SYNC:false,
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
    __next:function(){
        return this.__execs.pop();
    },
    end:function(err){
        this.emit("finish",err);
    },
    next:function(_args,bind){
        var me = this;
        // 标记处理状态为继续.
        me.processing = true;
        clearImmediate(this.__errDelay);
        var args;
        if(arguments.length > 0){
            args = Array.isArray(_args) ? _args.slice(0) : [_args];
        }else{
            args = [];
        }
        
        var run = null , exec;
        // 区分处理异步与同步
        if(this.__async){
            
            run = function(err,stop){
                var exec;
                if(err){
                    me.emit("error",err);
                }else if(stop == true){
                    me.emit("finish",err);
                }else if(exec = me.__next()){
                    try{
                        exec.apply(bind,args);
                    }catch(e){
                        me.emit("error",e);
                    }
                }else{
                    me.end();
                }
            };
            
            // 异步的next方法
            args.push(run);
        }else{
            run = function(){
                var exec; 
                // 同步
                while(exec = me.__next()){
                    try{
                        exec.apply(bind,args);
                    }catch(e){
                        me.emit("error",e);
                        return;
                    }
                }
                me.end();
            };
        };
        // 延迟执行, 用于实现链式调用.
        setImmediate(run);
        
        return me;
    },
    destroy:function(){
        //console.log("destroy");
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