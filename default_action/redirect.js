/**
 * 根据配置发送客户端重定向
 */
module.exports = function(){
	var url = this.params.url;
	this.redirect(url,302);
}
