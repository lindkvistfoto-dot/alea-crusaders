/* Isolate development browser state from the live ALEA app on the same origin. */
(function(){
  'use strict';
  var prefix='alea:dev:';
  var proto=Storage.prototype;
  if(proto.__aleaDevStorageScopeV1)return;
  var rawGet=proto.getItem,rawSet=proto.setItem,rawRemove=proto.removeItem,rawKey=proto.key;
  var lengthDescriptor=Object.getOwnPropertyDescriptor(proto,'length');
  function keys(storage){
    var all=[],total=lengthDescriptor&&lengthDescriptor.get?lengthDescriptor.get.call(storage):storage.length;
    for(var i=0;i<total;i++){var k=rawKey.call(storage,i);if(k&&k.indexOf(prefix)===0)all.push(k)}
    return all;
  }
  Object.defineProperty(proto,'__aleaDevStorageScopeV1',{value:true});
  proto.getItem=function(key){return rawGet.call(this,prefix+String(key))};
  proto.setItem=function(key,value){return rawSet.call(this,prefix+String(key),String(value))};
  proto.removeItem=function(key){return rawRemove.call(this,prefix+String(key))};
  proto.key=function(index){var k=keys(this)[Number(index)];return k?k.slice(prefix.length):null};
  proto.clear=function(){var own=keys(this);for(var i=0;i<own.length;i++)rawRemove.call(this,own[i])};
  if(lengthDescriptor&&lengthDescriptor.configurable){
    Object.defineProperty(proto,'length',{configurable:true,enumerable:lengthDescriptor.enumerable,get:function(){return keys(this).length}});
  }
})();