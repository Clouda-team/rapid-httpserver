var Crypto = require('crypto');

var isArray = Array.isArray;
var depcle = function(obj){
    var newObj;
    switch(typeof(obj)){
        case "array":
            newObj = [];
            break;
        case "object" :
            if(isArray(obj)){
                newObj = [];
            }else if(obj == null){
                return null;
            }else if(obj.constructor == Object){
                newObj = {};
            }else{
                return obj.toString();
            }
            break;
        case "function":
            return undefined;
        default:
            return obj;
    }
    
    for(var key in obj){
        newObj[key] = depcle(obj[key]);
    }
    
    return newObj;
};

var randomStr = function(_len){
    for(var str = "" , len = _len || 10 ; str.length < len ; str += (~~(Math.random() * 36)).toString(36));
    return str;
};


var encodeAes192 = function(data,secretKey,input_encoding,output_encoding){
    var encoder = Crypto.createCipher('aes192',secretKey);
    input_encoding = input_encoding || "utf8";
    output_encoding = output_encoding || "hex";
    var rs = encoder.update(data,input_encoding,output_encoding);
        rs += encoder.final(output_encoding);
    return rs;
};

var decodeAes192 = function(data,secretKey,input_encoding,output_encoding){
    var decoder = Crypto.createDecipher('aes192',secretKey);
    input_encoding = input_encoding || "hex";
    output_encoding = output_encoding || "utf8";
    var rs = decoder.update(data,input_encoding,output_encoding);
    rs += decoder.final(output_encoding);
    return rs;
};

var md5 = function(data){
    var encoder = Crypto.createHash('md5');
    encoder.update(data);
    return encoder.digest('hex');
};


var sha1 = function(){
    var sha1 = Crypto.createHash('sha1');
    var item = null;
    for(var i=0,len = arguments.length;i<len;i++){
        item = arguments[i] || "";
        // 统统转为字符串处理,如果没有toString方法,则认为是空字符串;
        sha1.update(item.toString?item.toString():"");
    }
    
    return  sha1.digest('hex');
};

var getTimestamp8 = function(){
	return (~~(Date.now()/1000)).toString(16);
}

var reg_getFunArgs = /function\s.*?\((.*?)\)\{.*/;
var reg_removeMultilineComment = /\/\*[\w\W]*?\*\//gm;
var reg_removeLineComment = /\/\/.*$/gm;
var reg_removeLF = /\s*\n\s*/gm;

var getFunArgs = function(fun){
    
    var funStr , len = fun.length ,rv = [], argsStr;
    
    if(len == 0){
        return rv;
    }
    
    funStr = fun.toString();
    funStr = funStr.replace(reg_removeMultilineComment,"");
    funStr = funStr.replace(reg_removeLineComment,"");
    funStr = funStr.replace(reg_removeLF,"");
    
    var parts = reg_getFunArgs.exec(funStr);
    
    if(parts && (argsStr = parts[1])){
        rv = argsStr.trim().split(/\s*,\s*/mg);
    }
    
    return rv;
};

var wildcardToReg = function(obj){
	if(obj.test instanceof Function){
        return obj;
    }else{
        /**
         * 处理通配符，将通配符翻译成正则对像
         * 目前就支持*号, 每个星号被翻译成(.*?)的匹配方式,
         */
    	obj = obj.replace(/\./gm,"\\.");
    	obj = obj.replace(/\?/gm,"\\?");
    	obj = obj.replace(/\|/gm,"\\|");
    	obj = obj.replace(/\{/gm,"\\{");
    	obj = obj.replace(/\}/gm,"\\}");
    	obj = obj.replace(/\(/gm,"\\(");
    	obj = obj.replace(/\)/gm,"\\)");
    	obj = obj.replace(/\*/gm,"(.*?)");
    	obj = "^" + obj + "$";
        return new RegExp(obj);
    }
}

module.exports = {
	getFunArgs:getFunArgs,
	wildcardToReg:wildcardToReg,
	depcle:depcle,
	randomStr:randomStr,
	getTimestamp8:getTimestamp8,
    encodeAes192:encodeAes192,
    decodeAes192:decodeAes192,
    md5:md5,
    sha1:sha1
};