//rapid-cookie

var encode = encodeURIComponent,
    decode = decodeURIComponent;

var serialize = function(name, val, opt){
    opt = opt || {};
    var enc = opt.encode || encode;
    var pairs = [name + '=' + enc(val)];

    if (null != opt.maxAge) {
        var maxAge = opt.maxAge - 0;
        if (isNaN(maxAge)) throw new Error('maxAge should be a Number');
        pairs.push('Max-Age=' + maxAge);
    }

    if (opt.domain) pairs.push('Domain=' + opt.domain);
    if (opt.path) pairs.push('Path=' + opt.path);
    if (opt.expires) pairs.push('Expires=' + opt.expires.toUTCString());
    if (opt.httpOnly) pairs.push('HttpOnly');
    if (opt.secure) pairs.push('Secure');

    return pairs.join('; ');
};

var parse = function(str, opt) {

    if(!str){ return; }
    opt = opt || {};
    var obj = {}
    var pairs = str.split(/; */);
    var dec = opt.decode || decode;

    pairs.forEach(function(pair) {
        var eq_idx = pair.indexOf('=');
        if (eq_idx < 0) {
            return;
        }

        var key = pair.substr(0, eq_idx).trim()
        var val = pair.substr(++eq_idx, pair.length).trim();

        if ('"' == val[0]) {
            val = val.slice(1, -1);
        }

        if (undefined == obj[key]) {
            try {
                obj[key] = dec(val);
            } catch (e) {
                obj[key] = val;
            }
        }
    });

    return obj;
};

module.exports = function(req,res){
    
    return {
        
        get : function (name) {

            if(typeof name === undefined) { throw new Error("key is required for cookie info!"); }

            if (!req.headers) { return; }

            if (!req.headers.cookie) { return; }

            var info = parse(req.headers.cookie);

            return info[name];

        },

        set : function(name, val, opts){

            var headers = res.getHeader("Set-Cookie") || [], 
                secure = req.connection.encrypted,
                cookie = serialize.apply(this, arguments);

            var reqCookie = req.headers.cookie || "";

            if(reqCookie.indexOf(cookie) >= 0){
                return this;
            }

            if (!secure && opts && opts.secure) { throw new Error("Cannot send secure cookie over unencrypted socket"); } 

            if (typeof headers == "string") { headers = [headers]; }

            headers.push(cookie);

            res.setHeader('Set-Cookie', headers);

            return this;
        }
    }

};

