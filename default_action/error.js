/**
 * New node file
 */

module.exports = {
    name:'error',
    handle:function(){
		var params = this.params;
		
		var statusCode = params.httpStatus || 500,
			msg = params.errorMsg || "Server Error : " + (params.errorCode || "Unknown"),
			content = params.errorStack || "Unknow";
		
		this.sendStatus(statusCode, msg, content);
	}
};