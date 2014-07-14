/**
 * 处理http status响应
 */
module.exports = {
    name:'http_status',
    handle:function(){
        var params = this.params;
        this.sendStatus(params.code,params.msg,params.body);
    }
};