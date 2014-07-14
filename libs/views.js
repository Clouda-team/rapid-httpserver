var swig = require('swig');
var path = require('path');

var views_dir = "/app/views/";
var suffix = '.html';

module.exports = {
	
	conf : function(opts){
		if(opts && opts.view_dir){ views_dir = opts.view_dir; }
	},

	render : function (viewname, data, opts){
		
		opts = opts || {};

		var fullPath =	path.join(ROOT_DIR, views_dir) + viewname + suffix;

		var tpl = swig.compileFile(fullPath, opts);
		
		return tpl(data);

	},

	renderStr : function(tplstr, data, opts){
		
		var tpl = swig.compile(tplstr, opts);

		return tpl(data);

	}

}