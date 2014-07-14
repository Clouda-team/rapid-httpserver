# rapid-httpserver

> rapid-httpserver is a plug-in for rapid+ framework.


##Depends
rapid-log : 用来打日志;


##概念
###Extension
用来实现http的功能包装，如session, cookie, fileupload, form等，每个extension使用固定的一个接口型式，接收request与response，并返回一个处理包装对像。一般来说,extension的不包含业务功能只是扩展http行为能力的一种包装,所以使用方式相对简单没有复杂配置,所有配置接写在http.conf对像下即可,无独立配置.

###Filter
每个filter可作用于每个http访问的请求过程中，用来处理一些通用业务，如安全认证的过滤，日志打印，统计等任务，多个Filter采用链式调用，全部通过则执行最终的action，在执行过程中可以中断执行（如认证检查失失败等）。

###Action
每组Filter的未端使用一个Action，用来实现最终的业务功能。

##LifeCircle
###启动

1. httpserver在被require时,将自动向rapid.plugin进行注册.
2. httpserver在被require时,将进行rapid.config.watch("rapid-server"),用于发现自动配置的存在.
3. 如果找到配置,根据autoStart=true的配置进行自动调用httpserver.start(),否则放弃启动.并等待手动执行httpserver.start(conf)方法.
4. 当autoStart=false或未提供配置信息时,可利用httpserver.start(conf)启动server. (如果存在配置,这里将提供一个替换默认配置的机会,两次配置不会进行合并,而是完全进行覆盖).

###运行
1. server启动后,直接监听配置端口(默认为8080),并开始接收请求.
2. 在请求到达时,将根据配置依次通过fiterChain与actionChain两条执行链,每个请求根据配置的url会完整经过所有配置的filter链并到达action链,在actionChain的执行中,在任意配置的action被执行时,将停止继续执行下一个.如果所有都不配置,则执行defaultAction,默认返回404错误给客户端.
3. 在处理请求的过程中,如果根据配置,需要处理请求的action或filter尚未载入(这种情况多发生在启动过程中,或受业务影响需要延迟提供的action与filter情况下.),系统将停止继续处理本次请求,并返回400或500错误.如果下次同样请求到来时,缺失的action与filter存在,则会正常派发处理.


##Configure

###autoStart
Boolean , true时依据配置自行启动，false时，需要通过httpd.start启动.

###port
Number, default 8080, httpd的运行端口。

###loading_dir
[string,string...]， 每项内容为一个目录的名称，启动时将载入目录下所有.js文件。每个文件用来定义action,extension,filter等内容。

###mapping
[object,object....] 用于配置url与action的映射关系及filter的执行. 每个object为一个配置对像。结构如下：

	{
		// 目标url，可以为一个正则对像，或一个包含*号的字符串对像.
		url:"",
		
		// 所执行的action名称或handle，
		doAction:"actionName" || function(){},
		
		// 执行当前action的配置参数.
		params:{....},
		
		// ------- 以下为一些预制的action, 用于替代doAction简化配置
	
		// 返回一个http状态，等价于 doAction:"http_status",
		http_status:{code:number, msg:"xxxx", body:"xxxxxx"}
		
		// 返回静态资源， value可以为一个目录直接是一个文件名， 等价于doAction:"resource", 
		resource:"/index.html"
		
		// 返回重定向. 等价于doAction:"redirect"
		redirect: "url"
	}
	
###filter
[object,oject,....] filter链，每一项表示一个被执行的过滤器对像,过滤器对像的配置与mapping的doAction配置类似,以减少对配置的理解成本.

	{
		// url限制,仅在匹配的情况下执行过滤器,如果需要配置非(not)操作,请使用正则对像.
		url:"/*",
		
		// 将值行filter的名称;
		doFilter:"name",
		
		// 执行时的配置参数,便于对一些相同过滤器不同参数不同行为的情况
		params:{
			key1:value1,
			.....
		}
	}
###

##APIs Document

###属性

###方法

####httpd.defineExtension(name,depends,handle);
除系统默认的载入的extension以外，如果需要自定义extension，则需要以这个方式添加
####httpd.defineFilter(name,depends,handle);
除系统默认载入的filter以外，如果需要自定义filter，则需要以这种方式添加。
####httpd.defineAction(name,depends,handle);
除系统默认载入的Action外，如需要自定义的action，则需要以这种方式添加。

####httpd.start(conf);
启动httpd服务，conf是配置对像，如果提供将与已有配置合并，如果服务已启动，则忽略执行

####httpd.getRealServer();
**!!important:直接操作这个对像可能导至不可预知的后果，如原有的router失效等**

***!!Note:这个方法为一些特殊插件的实现预留,如sockjs需要直接使用httpserver对像,并替换listner上的事件.大部份情况,不应该使用(谨慎使用)这个方法的返回对像.***

取得实际工作中的原始httpserver对像; 

----

### httpVisitor
>httpVisitor表示每个请求的上下文对像,在使用框架的过程中将自动被注入action与filter的this对像,并提供以下一些个方法,属于在http端常见的操作用于服务端重定向,客户端重定向,返回错误消息等,其中几个是包装了默认action中的处理. 

###httpVisitor.getComprcessType();
从请求的header中分析出客户端所支持的压缩类型.一般为gzip或deflate.

###httpVisitor.getComprcessStream(pipeOnStream);
根据request支持的类型,支持对应压缩类型的stream对像.pipeOnStream {WriteableStream} 当提供时,将直接将WriteableStream对像到返回的stream对像上,未提供时,返回不对接到任何对像上的Writeablestream对像.

###httpVisitor.parseForm(callback);
解析一般form表单的参数, 即content-type = application/x-www-form-urlencoded的表单.

###httpVisitor.parseQuery(callback);
解析query部份的参数.

###httpVisitor.parseParams(callback);
一并解析query与form,如果query上存在与form中同名的参数. query上的值将被覆盖.

###httpVisitor.setHeader(key,value);
httpResponse上setHeader的快捷方式.方法直接调用response的setHeader方法,支持key为一个map对像.

###httpVisitor.setExpires(t);
设置response上的expires信息, 当t为一个整数,表示从现在起向后多少秒后过期,当为字符串时,直接认为是GMT时间表示,当为Date对像直接将date对像转换为GMT格式

###httpVisitor.setMaxAge(sec);
设置response上的cache-coltrol:max-age={sec};

###httpVisitor.setNostore();
设置response上的cache-coltrol:no-store;

###httpVisitor.setNoCache();
设置response上的cache-coltrol:no-cache;

###httpVisitor.sendStatus(code,msg,body);
设置一个状态响应.

###httpVisitor.render(viewname,data,opts);
渲染一个模板,viewname为模板名称,将自动在config.views_dir中指定的位置下寻找模版,如果未提供配置.默认为/app/views;

###httpVisitor.renderStr(tplstr,data,opts);
渲染一个模板片段.

###httpVisitor.lookup(url);
根据一个url或fname的扩展名返回对应的mime类型.

###httpVisitor.forward(name,conf);
在server端重定向到指定的action处理链,这个重定向不再经过filter直指到达目标的action(***争议:目标action中可能需要过滤器的处理操作,但是反复经过过滤器链又有可能造成重复操作或被filter中的部份处理造成影响.考虑这些问题,不处理比重复处理或影响已有处理可能造成更坏的后果,所以暂定为不经过filter链,直接抵达action***)

###httpVisitor.redirect(url,[code]);
发送一个客户端重定向请求,url表示重定向位置,code表示返回的http状态,这里应为 301或302;

###httpVisitor.send(content,[code],[contentType])
###httpVisitor.sendContent(content,[code],[contentType]);
发送一段内容到客户端, 
content {string|buffer} , html的content内容
code {number}, http状态码, 默认为 200
header {map}, 需要附加的httpd头. 默认为: {"content-type":"text/html"}
res {ServerResponse} 将响应的response对像

###httpVisitor.sendFile(file,[code],[headers]);
发送一个文件到客户端,
file {string|file} , 将发送的文件的名称或file对像产生的readableStream,如果已得以buffer,请使用sendContent方法;
code {number}, http状态码, 默认为 200
header {map}, 需要附加的httpd头. 默认为: {"content-type":"text/html"}
res {ServerResponse} 将响应的response对像

###httpVisitor.sendError(error,[code]);
发送一个错误信息到前端
error 错误对像,
code http status code
