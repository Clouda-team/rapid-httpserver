/**
 * 基于内存的session
 * 
 * 实现单server结点内的session功能.由内存实现,
 * 不做稳定性保证,重启时,信息将丢失.
 */
var Cookie = require("./cookie.js");
var tools = require("../libs/lib.js");
var EventEmitter = require("events").EventEmitter;
var util = require("util");

//clientid 超时时间,10年后超时.
var clientExpires = 315360000000; 		  // 1000 * 60 * 60 * 24 * 365 * 10, 10年;

//session 超时, 20分钟
var sessionTimeout = 1200000;	  		  // 1000 * 60 * 20, 20分钟;

/**
 * 活动的session池,由于同时活动的session可能很多,所以不会使用每个session一个timout的即时清理策略
 * 而是使用周期性的清理策略,每个session在启动时记录自身的会话时间和最后一次的活动时间.
 */
var pool = {};

var gcGapMin = 300000;					  // 1000 * 60 * 5, 最小5分钟;
var gcGap = sessionTimeout / 2;		  	  // 默认GC时间为sessionTimeout一半的时间;
var gcTimer = null; 					  // gc timer,
var gcMaxTimer = null;					  // 最大循环周期;

var randomStr = function(_len){
	var rv,str = [] , len = _len || 10;
	for(; str.length < len ; str.push((~~(Math.random() * 16)).toString(16)));
	rv = str.join("");
	str.length = 0;
	return rv; 
};

var createClientId=function(){
	var timestamp8 = tools.getTimestamp8();
	var rand8 = tools.randomStr(8);
	return timestamp8 + rand8;
}

var createSessionId = function(mid){
	var timestamp8 = tools.getTimestamp8();
	var rand8 = tools.randomStr(8);
	return timestamp8 + mid + rand8 ;
}

var __gc = function(maxTimeout){
	
	/**
	 * 如果是到达最大循环周期,但是还有二分钟的小timer未执行,
	 * 则跳过这一次等待小timer执行即可
	 */
	if(maxTimeout == true &&  gcTimer != null){
		return;
	}
	
	log.dev("rapid-Session : start GC");
	
	var session;
	for(var sid in pool){
		session = pool[sid];
		if(session.isTimeout() == true){
			session.emit("timeout");	//触发timeout,通知超时
			delete pool[sid];			//移出池.
		}
	}
	
	gcTimer = null;
	// 设置最长周期时间.防止长时间没有请求时,session不超时.
}

var gc = function(){
	if(gcTimer == null){
		gcTimer = setTimeout( __gc , gcGapMin , false);
	}
	
	if(gcMaxTimer == null){
		gcMaxTimer = setInterval( __gc , gcGap ,true);
		gcMaxTimer.unref();	//防止setInterval在服务停止后扔然阻止进程退出
	}
}

var Session = function(sessionId){
	
	var me;
	
	var values = {};
	var startTime = Date.now();
	var lastActiveTime = startTime;
	
	if(me = pool[sessionId]){
		log.dev("find alive session [%s]", sessionId);
		me.__keepAlive();
		return me;
	}else{
		me = pool[sessionId] = this;
	}
	
	log.dev("create Session[%s].",sessionId);
	
	// call super;
	EventEmitter.call(this);
	
	this.__keepAlive = function(){
		return lastActiveTime = Date.now();
	}

	this.getId = function(){
		return sessionId;
	};
	
	this.get = function(key){
		return values[key];
	};
	
	this.set = function(key,value){
		return values[key] = value;
	};
	
	this.getStartTime = function(){
		return startTime;
	};
	
	this.getLastActiveTime = function(){
		return lastActiveTime;
	};
	
	this.isTimeout = function(){
		return lastActiveTime + sessionTimeout - Date.now() < 0;
	}
	
	this.on("timeout",function(){
		log.dev("session [%s] timeout!",sessionId);
		for(var key in values){
			values[key] = undefined;
			delete values[key];
			values = undefined;
		}
	});
}

util.inherits(Session,EventEmitter);

var sessionFactory = function(req,res){
	//debugger;
	var cookie = Cookie(req,res);
	var session = new EventEmitter();
	/**
	 * 机器码, 长效追逐一台机器.
	 */
	var clientId = cookie.get("rapid-client-id");
	
	/**
	 * session, 一次访问
	 */
	var sessionid = cookie.get("rapid-session-id");
	
	if(typeof(clientId) != 'string' || clientId.length != 16){
		clientId = createClientId();
		var expires = new Date(Date.now() + clientExpires);
		cookie.set("rapid-client-id",clientId,{
			expires:new Date(Date.now() + clientExpires),
			path:"/"
		});
	}
	
	if(typeof(sessionid) != 'string' || sessionid.length != 32){
		sessionid = createSessionId(clientId);
		cookie.set("rapid-session-id", sessionid, {
			path : "/"
		});
	}
	
	gc();
	
	return new Session(sessionid);
}

module.exports = sessionFactory;

