import ctypes as c,json,re,pathlib
E=c.CDLL('libEGL.so.1');E.eglGetProcAddress.argtypes=[c.c_char_p];E.eglGetProcAddress.restype=c.c_void_p
P=c.CFUNCTYPE(c.c_void_p,c.c_uint,c.c_void_p,c.POINTER(c.c_int))(E.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
d=P(0x31DD,None,None)
E.eglInitialize.argtypes=[c.c_void_p,c.POINTER(c.c_int),c.POINTER(c.c_int)];a=c.c_int();b=c.c_int();assert E.eglInitialize(d,c.byref(a),c.byref(b)),'No surfaceless EGL'
E.eglBindAPI(0x30A0)
E.eglChooseConfig.argtypes=[c.c_void_p,c.POINTER(c.c_int),c.POINTER(c.c_void_p),c.c_int,c.POINTER(c.c_int)]
attrs=(c.c_int*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038);config=c.c_void_p();n=c.c_int();assert E.eglChooseConfig(d,attrs,c.byref(config),1,c.byref(n)) and n.value
E.eglCreatePbufferSurface.argtypes=[c.c_void_p,c.c_void_p,c.POINTER(c.c_int)];E.eglCreatePbufferSurface.restype=c.c_void_p
surf=E.eglCreatePbufferSurface(d,config,(c.c_int*5)(0x3057,16,0x3056,16,0x3038))
E.eglCreateContext.argtypes=[c.c_void_p,c.c_void_p,c.c_void_p,c.POINTER(c.c_int)];E.eglCreateContext.restype=c.c_void_p
ctx=E.eglCreateContext(d,config,None,(c.c_int*3)(0x3098,3,0x3038));assert ctx
E.eglMakeCurrent.argtypes=[c.c_void_p,c.c_void_p,c.c_void_p,c.c_void_p];assert E.eglMakeCurrent(d,surf,surf,ctx)
def gl(name,ret,*args):return c.CFUNCTYPE(ret,*args)(E.eglGetProcAddress(name.encode()))
create=gl('glCreateShader',c.c_uint,c.c_uint);source=gl('glShaderSource',None,c.c_uint,c.c_int,c.POINTER(c.c_char_p),c.POINTER(c.c_int));compile=gl('glCompileShader',None,c.c_uint);info=gl('glGetShaderiv',None,c.c_uint,c.c_uint,c.POINTER(c.c_int));log=gl('glGetShaderInfoLog',None,c.c_uint,c.c_int,c.POINTER(c.c_int),c.c_char_p)
def shader(kind,src):
 s=create(kind);data=('#version 300 es\nprecision highp float;\n'+src).encode();p=c.c_char_p(data);source(s,1,c.byref(p),None);compile(s);ok=c.c_int();info(s,0x8B81,c.byref(ok));buf=c.create_string_buffer(4096);log(s,4096,None,buf);assert ok.value,buf.value.decode();return s
root=pathlib.Path(__file__).resolve().parents[1]
vert=json.loads(re.search(r'var vertex = (".*");',(root/'node_modules/pixi.js/lib/filters/defaults/defaultFilter.vert.mjs').read_text()).group(1))
text=(root/'src/lighting.ts').read_text();v=vert.replace('out vec2 vTextureCoord;','out vec2 vTextureCoord;\nout vec2 vMapCoord;\nuniform vec2 uMapOrigin;\nuniform vec2 uMapSize;\nuniform float uMapScale;').replace('vTextureCoord = filterTextureCoord();','vTextureCoord = filterTextureCoord();\n vMapCoord = (aPosition*uOutputFrame.zw+uOutputFrame.xy-uMapOrigin)/(uMapScale*uMapSize);');f=re.search(r'fragment:`(.*?)`',text,re.S).group(1)
vs=shader(0x8B31,v);fs=shader(0x8B30,f)
program=gl('glCreateProgram',c.c_uint)();gl('glAttachShader',None,c.c_uint,c.c_uint)(program,vs);gl('glAttachShader',None,c.c_uint,c.c_uint)(program,fs);gl('glLinkProgram',None,c.c_uint)(program);ok=c.c_int();gl('glGetProgramiv',None,c.c_uint,c.c_uint,c.POINTER(c.c_int))(program,0x8B82,c.byref(ok));buf=c.create_string_buffer(4096);gl('glGetProgramInfoLog',None,c.c_uint,c.c_int,c.POINTER(c.c_int),c.c_char_p)(program,4096,None,buf);assert ok.value,buf.value.decode()
fwater=re.search(r'fragment:`(.*?)`',(root/'src/water.ts').read_text(),re.S).group(1);shader(0x8B30,fwater)
print('PASS: Lighting vertex + fragment compiled and linked with OpenGL ES 3; all water shader branches compile.')
# Exercise the composition shader with actual ES3 pixels, not a duplicate CPU formula.
gl('glUseProgram',None,c.c_uint)(program)
uniform=gl('glGetUniformLocation',c.c_int,c.c_uint,c.c_char_p)
def u1(name,value):gl('glUniform1f',None,c.c_int,c.c_float)(uniform(program,name.encode()),value)
def uv(name,values):gl('glUniform'+str(len(values))+'fv',None,c.c_int,c.c_int,c.POINTER(c.c_float))(uniform(program,name.encode()),1,(c.c_float*len(values))(*values))
textures=(c.c_uint*2)();gl('glGenTextures',None,c.c_int,c.POINTER(c.c_uint))(2,textures)
def tex(index,pixels):
 gl('glActiveTexture',None,c.c_uint)(0x84C0+index);gl('glBindTexture',None,c.c_uint,c.c_uint)(0x0DE1,textures[index])
 for pname,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:gl('glTexParameteri',None,c.c_uint,c.c_uint,c.c_int)(0x0DE1,pname,value)
 gl('glTexImage2D',None,c.c_uint,c.c_int,c.c_int,c.c_int,c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p)(0x0DE1,0,0x1908,1,1,0,0x1908,0x1401,(c.c_ubyte*4)(*pixels))
tex(0,[160,120,80,255]);tex(1,[0,0,0,0]);gl('glUniform1i',None,c.c_int,c.c_int)(uniform(program,b'uTexture'),0);gl('glUniform1i',None,c.c_int,c.c_int)(uniform(program,b'uLightMap'),1)
uv('uInputSize',[16,16,1/16,1/16]);uv('uOutputFrame',[0,0,16,16]);uv('uOutputTexture',[16,16,1,0]);uv('uMapOrigin',[0,0]);uv('uMapSize',[16,16]);u1('uMapScale',1);uv('uDarkColor',[9/255,20/255,38/255])
buffer=c.c_uint();gl('glGenBuffers',None,c.c_int,c.POINTER(c.c_uint))(1,c.byref(buffer));gl('glBindBuffer',None,c.c_uint,c.c_uint)(0x8892,buffer);vertices=(c.c_float*8)(0,0,1,0,0,1,1,1);gl('glBufferData',None,c.c_uint,c.c_size_t,c.c_void_p,c.c_uint)(0x8892,c.sizeof(vertices),vertices,0x88E4);loc=gl('glGetAttribLocation',c.c_int,c.c_uint,c.c_char_p)(program,b'aPosition');gl('glEnableVertexAttribArray',None,c.c_uint)(loc);gl('glVertexAttribPointer',None,c.c_uint,c.c_int,c.c_uint,c.c_ubyte,c.c_int,c.c_void_p)(loc,2,0x1406,0,0,None);gl('glViewport',None,c.c_int,c.c_int,c.c_int,c.c_int)(0,0,16,16)
def render(darkness,light):
 u1('uDarkness',darkness);tex(1,light);gl('glDrawArrays',None,c.c_uint,c.c_int,c.c_int)(0x0005,0,4);out=(c.c_ubyte*4)();gl('glReadPixels',None,c.c_int,c.c_int,c.c_int,c.c_int,c.c_uint,c.c_uint,c.c_void_p)(8,8,1,1,0x1908,0x1401,out);return list(out)
day=render(0,[0,0,0,0]);night=render(.63,[0,0,0,0]);black=render(1,[0,0,0,0]);torch=render(1,[255,160,70,255]);overlap=render(1,[255,255,140,255]);assert day[:3]==[160,120,80],day;assert sum(black[:3])<sum(night[:3])<sum(day[:3]);assert sum(torch[:3])>sum(black[:3]);assert all(x>=y for x,y in zip(overlap[:3],torch[:3]));print('PASS: ES3 pixel tests: 0% restores map, 63/100% darkness darkens, lights restore image detail, overlap adds brightness.',dict(day=day,night=night,maxDark=black,torch=torch,overlap=overlap))
