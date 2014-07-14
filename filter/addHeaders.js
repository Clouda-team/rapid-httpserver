module.exports = {
    handle:function(){
        var req = this.request, res = this.response;
    	var params = this.params;
    	if(params){
    		this.setHeader(params);
    	}
        this.next();
    },
    depends:[]
};
