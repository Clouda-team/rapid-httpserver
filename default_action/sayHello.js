/**
 * New node file
 */


module.exports = function(){
    var params = this.params;
    this.sendContent("Hello, " + (params.name || "Anoymous!!") + "!!");
}
