# rapid-httpserver
[![NPM version](https://badge.fury.io/js/rapid-httpserver.svg)](http://badge.fury.io/js/rapid-httpserver)
[![Dependency Status](https://david-dm.org/clouda-team/rapid-httpserver.svg)](https://david-dm.org/clouda-team/rapid-httpserver)

> Rapid-httpserver是由[RapidJS](http://cloudaplus.duapp.com/rapid/introduction/rapid_introduction/)提供的基础插件用来提供Http Server的服务能力


##Depends
rapid-core : rapid 运行时支撑;


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

### Request流程

<img src="http://cloudaplus.duapp.com/md/images/request_flow.png" width="100%" />

每个请求到达时，将根据配置依次通过fiterChain与actionChain两条执行链，每个请求根据配置（路由）的URL完整的经过fiterChain中配置的所有filter并到达actionChain，在actionChain的执行中，在任意配置的action被执行时，将停止继续执行下一个。如果所有都不配置，则执行defaultAction，默认返回404错误给客户端。

## 使用手册

* [Get Started](http://cloudaplus.duapp.com/rapid/introduction/get_started)
* [API Docuemt](http://cloudaplus.duapp.com/rapid/httpserver/api_document)
* [To Learn More](http://cloudaplus.duapp.com/)

