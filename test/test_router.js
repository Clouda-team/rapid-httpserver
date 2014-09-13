/**
 * New node file
 */

// ====================================================== //
// ============        UNIT TEST         ================ //
// ====================================================== //

GLOBAL.log = require("rapid-log")();
var $,Router;
var ActionVisitor  = require("../libs/actionVisitor.js");
var EventEmitter = require("events").EventEmitter;
var _extend = require("util")._extend;
var Domain = require("domain");
var profile = require("v8-profiler");
$ = Router = require("../libs/router.js");

$.defineExtension("ext1", function(req,res){
    return {exec:function(str){
        //log.info("i'm ext1");
        return "i'm ext1, " + str;
    }}
});

$.defineExtension("ext2", function(req,res){
    return {exec:function(str){
        //log.info("i'm ext2");
        return "i'm ext2, " + str;
    }}
});

$.defineAction("error",function(){
    var params = this.params;
    
    var statusCode = params.httpStatus || 500,
        msg = params.errorMsg || "Server Error : " + (params.errorCode || "Unknown"),
        content = params.errorStack || "Unknow";
    this.response.statusCode = statusCode;
    this.response.end(msg + "<br />\n" + content);
});

$.defineAction("action1",["ext1","ext2"],function(ext1,ext2){
    
    var content = '<img id="abc" />';
    
    var str = ext2.exec(ext1.exec("ok" + content));
//    str += '<script type="text/javascript">'
//        + 'console.log("trying"); \n'
//        + 'setTimeout(function(){'
//        + 'var img = document.querySelector("img"); \n'
//        + 'img.src = "http://img3.3lian.com/2006/013/08/20051103121420947.gif" \n'
//        + 'console.log("end");\n'
//        + '},1000);'
//        + '</script>'
        
    //log.info("i'm action1");
    debugger;
    this.send(str);
});

$.defineFilter("filt1",function(){
    log.info("i'm filt1");
    //debugger;
    //this.write("next:");
    this.next();
});

$.defineFilter("filt2",function(){
    log.info("i'm filt2");
    //debugger;
    if(~~(Math.random() * 10) > 9){
        log.info("end 1/10");
        this.finish(new Error("this is end!"));
    }else{
        this.next();
    }
});

var root = new $({
    defaultAction:function(){
        this.send("lalalalalalala.....");
    }
});



//debugger;
var abc = new $({
    filters:[
        {
           url:"/*",
           doFilter:"filt1"
       }],
    defaultAction:"action1"
});

var def = new $({
    filters:[
         {
             url:"/*",
             doFilter:"filt2"
         }
    ],
    defaultAction:function(){
       this.send("hahahahahahahaha.....");
    }
});

root.mount("/abc",abc);

abc.mount("/def",def);

var fs = require("fs");
function logProfile(prof){
    fs.writeFileSync("prof_"+ Date.now() + ".cpuprofile",JSON.stringify(prof));
    console.log("done!");
}

console.log("before start");
var httpd = true;

if(httpd == true){
    
    var cluster = require('cluster');
    var http = require('http');
    var singleThread = true;
    if (cluster.isMaster && !singleThread) {
        
        // Keep track of http requests
        var numReqs = 0;
        setInterval(function() {
            console.log("numReqs =", numReqs);
        }, 1000);
        
        // Count requestes
        function messageHandler(msg) {
            if (msg.cmd && msg.cmd == 'notifyRequest') {
                numReqs += 1;
            }
        }
        
        // Start workers and listen for messages containing notifyRequest
        var numCPUs = require('os').cpus().length;
        for (var i = 0; i < numCPUs; i++) {
            cluster.fork();
        }
        
        Object.keys(cluster.workers).forEach(function(id) {
            cluster.workers[id].on('message', messageHandler);
        });
        
    } else {
        
        // Worker processes have a http server.
        http.Server(function(req, res) {
            
            var context = new ActionVisitor(req,res);
            
            context.on("error",function(err){
                log.err(err.stack);
                this.sendError(err,500);
            });
            
            var dispatch = context.domain.bind(root.dispatch);
            //debugger;
            dispatch.call(root,context);
            
            // notify master about the request
            singleThread || process.send({ cmd: 'notifyRequest' });
        }).listen(8000,function(){
            log.info("%s http server start runing, on port %d...", "UnitTest For Router", 8000);
        });
    }
    
}else{
    
    var url = [
               "/",
               "/abc/",
               "/abc/1def/ghi/jkl?a=100&b=200",
               "/abc/def/ghi/jkl?a=100&b=200"
               ];
    
    var c = 0;
    var max = 30000;
    console.time("t");
    profile.startProfiling("profile");
    for (var i=0; i < max; i++){
        
        var fakeReq = _extend(new EventEmitter(),{
            url:url[3]
        });
        
        var fakeRes = _extend(new EventEmitter(),{
            send:function(str,isError){
                isError && log.info(c + ";   " + str);
                if(c++, c >= max){
                    var cpuProfile = profile.stopProfiling("profile");
                    console.timeEnd("t");
                    console.log("=======\n======= end [%d][%d]  =======\n=======\n ", c,i);
                    logProfile(cpuProfile);
                }
            }
        });
        
        //var fakeContext = _extend(new EventEmitter(),{
        var fakeContext = _extend(new ActionVisitor(fakeReq,fakeRes),{
            request:fakeReq,
            response:fakeRes,
            req_pathname:fakeReq.url,
            cachedExt:[],
            send:function(str){
                this.response.send(str);
            },
            sendError:function(str){
                this.response.send(str,true);
            }
        });
        
        var mydomain = Domain.create();
        
        mydomain.add(fakeContext);
        mydomain.on("error",function(err){
            fakeContext.sendError(err && err.stack);
        });
        
        //debugger;
        root.dispatch(fakeContext);
    }
}


//log.info("ok");