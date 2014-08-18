/**
 * New node file
 */

var http = require("http");
var depcle = require("../libs/lib.js").depcle;
var url = require('url');

//将url映射到目标路径的替换标记.
var partReg = /\{(\d+?)\}/g;
/*
 * 处理url到filepath的转换
 * 
 * 如果包含替换标记,则进行替换,否则检查路径是否是完全文件路径, 如果不是,则拼写一个{1}到最后
 * 方法最终返回一个file资源的fsObject对像
 */
var makePath = function(pattern,dstpath,url){
	// 处理默认替换标记.
	dstpath = dstpath.replace(/\*/m,"{1}");
	
	log.dev("FetchURL : make path: ", pattern,dstpath,url);
	
	// 不含可替换部份,直接返回,否则解析url进行替换.
    if(partReg.test(dstpath)){
    	if(pattern.test(url)){
    		var urlParts = pattern.exec(url);
    		
    		if(urlParts.length > 1){
    			urlParts[0] = '';	// 防止有人从0开始引用
    		}else{
    			// 如果只有一个结果,将其替换为1, 做为默认的全路径拼接使用.
    			urlParts[1] = urlParts[0]
    		}
    		
    		dstpath = dstpath.replace(partReg,function(match,mValue){
    			var rv = urlParts[mValue]
    			return rv === undefined ? "" : rv;
    		});
    	}
    }
    
    return dstpath;
}


module.exports = function(){
	
	var req, res, params;
	var urlPattern, reqPath, dstPath, fullPath;
	var headers , host ; 
	var opts; 

	req = this.request;
	res = this.response;
	params = this.params;
	
	// 映射目标位置
	desPath = params.dst_path;
	
	urlPattern = this.urlPattern;
	
	// 只要url中的资源path部份,
	reqPath = url.parse(req.url).pathname;
	
	// 最终请求的完整路径
	fullPath = makePath(urlPattern,desPath,reqPath);
	
	opts = url.parse(fullPath);
	
	opts.method = req.method;
	
	opts.auth = params.auth || undefined;
	opts.agent = params.agent || undefined;
	
	opts.headers = depcle(req.headers);
	
	// 除加代理header
	opts.headers["x-Forwarded-Host"] = opts.headers.host;
	
	// 干掉不应该被转发的headers
	delete opts.headers["connection"];
	
	if(params.headers){
		// 配置中设置的优先;
		for(var key in params.headers){
			opts.headers[key] = params.headers[key];
		}
	}
	
	var proxyReq = null;
	switch(opts.method){
		case "GET" :
			proxyReq = http.request(opt,function(){
				
			});
		case "POST" :
			
			break;
		default:
			throw new Error("Unsupport Mehtods :  " + opts.method + "  " + req.url);
	}

	
	
	this.send(JSON.stringify(opts));
	
}