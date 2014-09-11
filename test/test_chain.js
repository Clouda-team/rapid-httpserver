/**
 * New node file
 */

var Chain = require("../libs/chain.js");
var Domain = require("domain");

// async function . 
var tf = function(item,next){
    item.i++;
    console.log(item);
    next && next();
};

var tff = function(item,next){
    next && next(null,true);
}

var tf_with_error = function(item){
    item.i++;
    console.log(item);
    debugger;
    throw(new Error("occur error when i is " + item.i));
}

debugger;
var dm1 = Domain.create();
var c1 = new Chain([tf,tf,tf,tf],true);     // test async

var tt = dm1.add(c1);

dm1.on("error",function(err){
    /**
     * 如果chain上的错误没被捕获,则会被抛向上层domain对像.
     */
    console.log("process error \n", err.stack);
});

c1.next({i:0}).whenFinish(function(){
    console.log("all done!!");
});

var dm1 = Domain.create();
var c1 = new Chain([tf,tf,tf,tf],true);     // test async


var dm2 = Domain.create();
var c2 = new Chain([tf_with_error,tf_with_error,tf_with_error,tf_with_error],false);    // test sync

c2.next({i:-4}).whenFinish(function(err){
    console.log("all done!!");
}).whenError(function(err){
    console.log("ok , i am process the error. don't tall the parent domain.");
    this.next({i:0});
});

var dm3 = Domain.create();
var c3 = new Chain([tf_with_error,tf_with_error,tf_with_error,tf_with_error],false);    // test sync

c3.next({i:-4}).whenFinish(function(err){
    console.log("all done!! ", err && err.stack);
}).whenError(function(err){
    console.log("where is the error? ", err.stack);
    this.next({i:100});
});