/**
 * 处理静态文件转发
 */

var url = require('url');
var path = require('path');
var fs = require('fs');
var mime = require("../libs/mime");
//var gzip = require("../libs/gzip");
var zlib = require('zlib');
// 将url映射到目标路径的替换标记.
var partReg = /\{(\d+?)\}/g;
/*
 * url: /img/big/up0618100.png
 * /img/big/up(\d{4})(.*) -->  /image/$1/big/*
 * 
 * url: /img(.*?)
 * -  /abc/{1}
 */

/*
 * 处理url到filepath的转换
 * 
 * 如果包含替换标记,则进行替换,否则检查路径是否是完全文件路径, 如果不是,则拼写一个{1}到最后
 * 方法最终返回一个file资源的fsObject对像
 */
var makePath = function(pattern,dstpath,url){
	
	// 处理默认替换标记.
	dstpath = dstpath.replace(/\*/m,"{1}");
	
	log.dev("make path: ", pattern,dstpath,url);
	
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
	
	var me = this;
	var req = this.request, res = this.response, params = this.params;
	
    var urlPattern = this.urlPattern;
    var chunkTransfer = typeof( params.chunkTransfer ) == 'number' ? params.chunkTransfer : 0 ;
    
    var defaultResource = params.defaultResource || "index.html";
    
    // 只要url中的资源path部份,
    var reqPath = url.parse(req.url).pathname;
    
    // 映射目标位置
    var desPath = params.dst_path;
    
    //debugger;
    var fullPath = makePath(urlPattern,desPath,reqPath);
    
    fullPath = path.join(ROOT_DIR,fullPath);
    
    //处理默认访问
    if(fullPath.lastIndexOf("/") == fullPath.length -1){
    	fullPath = path.join(fullPath,defaultResource);
    }
    
    fs.stat(fullPath,function(err, status){
        
    	if(err){
    		if(err.code == "ENOENT"){
    			me.sendError(new Error("resource is no exists") , 404);
    		}else{
    			log.err(err.stack);
    			me.sendError(err,500);
    		}
    		return;
    	}
    	
    	// 304
    	var modifiedSince = req.headers["if-modified-since"];
    	
    	if(modifiedSince !== undefined){
    		modifiedSince = new Date(modifiedSince);
    		if(status.mtime.valueOf() == modifiedSince.valueOf()){
    			res.statusCode = 304;
    			res.end();
    			return;
    		}
    	}
    	
    	me.sendFile(fullPath,200,{
			gzip:params.gzip,
			isChunk : status.size > chunkTransfer,
			headers:{
				'Content-type':mime.lookup(fullPath),
				"Last-Modified":status.mtime.toGMTString()
			}
		});

    });
}