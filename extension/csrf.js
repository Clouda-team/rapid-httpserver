var Cookie = require("./cookie");
var cidkey = "rapid-client-id";
var maxLength = 6;

rapid._csrf = {};

module.exports = function(req,res){

	var cookie = Cookie(req, res);

	return function(data){

		data = data || {};
		var clientId = cookie.get(cidkey);
		var rand = Math.random().toString(36).slice(2);
		
		//save in rapid._csrf
		rapid._csrf[clientId] = rapid._csrf[clientId] || [];
		if(rapid._csrf[clientId].length >= maxLength){
			rapid._csrf[clientId].pop();
		}
		rapid._csrf[clientId].push(rand);

		data.csrfToken = rand;

		return data;

	}

}