/**
 * New node file
 */

var Chain = require("../libs/chain.js");
var Domain = require("domain");

var execItem = function(storage,next){
    storage.c++;
    next && setTimeout(next,10);
};

var getError = function(){
    throw new Error("get error");
}

var storage = {c:0};

// ========= 同步链测试 ============

var async = false;

// 无错误
function noErr(done){
    storage.c = 0
    var lib =  async ? "async" : "sync";
    var title = "no error";
    console.log("%s, %s, start ", title, lib);
    new Chain([execItem,execItem,execItem,execItem,execItem],async).whenFinish(function(err){
        if(err){
            console.log("finish: \n%s", err.stack);
        }
        console.log("%s, %s, end , rs %d ", title, lib, storage.c);
        hasErrAndConti(done);
    }).next(storage);
}

// 有错误,并继续;
function hasErrAndConti(done){
    storage.c = 0;
    var lib =  async ? "async" : "sync";
    var title = "error and continue";
    console.log("%s, %s, start ", title, lib);
    
    new Chain([execItem,execItem,getError,execItem,execItem,execItem],async).whenFinish(function(err){
        
        if(err){
            console.log("finish: \n%s", err.stack);
        }
        console.log("%s, %s, end , rs %d ", title, lib, storage.c);
        hasErrAndBrk(done);
        
    }).whenError(function(err){
        console.log("error : process error and continue",err);
        this.next(storage);
    }).next(storage);
}

// 有错误,不继续;
function hasErrAndBrk(done){
    storage.c = 0;
    var lib =  async ? "async" : "sync";
    var title = "error and break";
    
    console.log("%s, %s, start ", title, lib);
    
    new Chain([execItem,execItem,getError,execItem,execItem,execItem],async).whenFinish(function(err){
        
        if(err){
            console.log("finish: \n%s", err.stack);
        }
        
        console.log("%s, %s, end , rs %d ", title, lib, storage.c);
        
        hasErrAndNoHandle(done);
    }).whenError(function(err){
        console.log("error : process error and break!",err);
    }).next(storage);
}

function hasErrAndNoHandle(done){
    storage.c = 0;
    var domain = Domain.create();
    var lib =  async ? "async" : "sync";
    var title = "no process error";
    
    console.log("%s, %s, start ", title, lib);
    
    domain.add(
    new Chain([execItem,execItem,execItem,getError,execItem,execItem],async).whenFinish(function(err){
        console.error("if run at here is an error");
    }).next(storage)
    );
    
    domain.on("error",function(err){
        debugger;
        if(err){
            console.log("finish: \n%s", err.stack);
        }
        
        console.log("%s, %s, end , rs %d ", title, lib, storage.c);
        
        domain.remove(hasErrAndNoHandleNoDomain(done));
        domain.dispose();
    })
}

function hasErrAndNoHandleNoDomain(done){
    storage.c = 0;
    var lib =  async ? "async" : "sync";
    var title = "no process error and no domain";
    
    console.log("%s, %s, start ", title, lib);
    var c = new Chain([execItem,execItem,execItem,getError,execItem,execItem],async);
    
    c.whenFinish(function(err){
        console.error("if run at here is an error");
    }).next(storage);

    process.on("uncaughtException",function(e){
        console.log("what??????", e.stack);
        process.removeAllListeners("uncaughtException");
        
        done();
    })
    
    return c;
}

noErr(function(){
    //  异步链测试
    async = true;
    console.log("----------------");
    
    noErr(function(){
        console.log("all done!!!!");
    });
});


