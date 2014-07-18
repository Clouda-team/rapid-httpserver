module.exports = {
    handle:function(cookie){
        
        var req = this.request;
        var res = this.response;

        //ignore other methods
        if(req.method.toLowerCase() !== "post"){
        	this.next();
        	return ;
        }

        var cid = cookie.get("rapid-client-id");
        var tokens = rapid._csrf[cid] || [];

        //默认从3个地方找token
		//1.check query
        //2.check headers' x-csrf-token || x-csrf-token
        var reqToken = this.url("?csrfToken", req.url) || req.headers['x-csrf-token'] || req.headers['x-csrf-token'];
        if(reqToken && tokens.indexOf(reqToken) >= 0){
        	this.next();
        	return ;
        }

        //3.check form req.body
		this.parseForm(function(err,params){

			if(params && params.csrfToken && tokens.indexOf(params.csrfToken) >= 0){
				this.next();
			} else{
				this.sendContent("Forbiden", 403);
			}
		});

    },
    depends:["cookie"]
};