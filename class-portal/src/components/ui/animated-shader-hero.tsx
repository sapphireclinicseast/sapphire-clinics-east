'use client'

import React, { useEffect, useRef } from 'react'

interface HeroProps {
  trustBadge?: {
    text: string
    icons?: string[]
  }
  headline: {
    line1: string
    line2: string
  }
  subtitle: string
  buttons?: {
    primary?: { text: string; onClick?: () => void }
    secondary?: { text: string; onClick?: () => void }
  }
  className?: string
}

const defaultShaderSource = `#version 300 es
/*********
* made by Matthias Hurrle (@atzedent)
*/
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p) {
  p=fract(p*vec2(12.9898,78.233));
  p+=dot(p,p+34.56);
  return fract(p.x*p.y);
}
float noise(in vec2 p) {
  vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  float
  a=rnd(i),
  b=rnd(i+vec2(1,0)),
  c=rnd(i+vec2(0,1)),
  d=rnd(i+1.);
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p) {
  float t=.0, a=1.; mat2 m=mat2(1.,-.5,.2,1.2);
  for (int i=0; i<5; i++) {
    t+=a*noise(p);
    p*=2.*m;
    a*=.5;
  }
  return t;
}
float clouds(vec2 p) {
  float d=1., t=.0;
  for (float i=.0; i<3.; i++) {
    float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);
    t=mix(t,d,a);
    d=a;
    p*=2./(i+1.);
  }
  return t;
}
void main(void) {
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for (float i=1.; i<12.; i++) {
    uv+=.1*cos(i*vec2(.1+.01*i, .8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  O=vec4(col,1);
}`

const vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main(){gl_Position=position;}`

const vertices = [-1, 1, -1, -1, 1, 1, 1, -1]

interface ShaderUniforms {
  resolution: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
  move: WebGLUniformLocation | null
  touch: WebGLUniformLocation | null
  pointerCount: WebGLUniformLocation | null
  pointers: WebGLUniformLocation | null
}

class WebGLRenderer {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private program: WebGLProgram | null = null
  private vs: WebGLShader | null = null
  private fs: WebGLShader | null = null
  private buffer: WebGLBuffer | null = null
  private scale: number
  private shaderSource: string = defaultShaderSource
  private uniforms: ShaderUniforms = {
    resolution: null, time: null, move: null, touch: null, pointerCount: null, pointers: null,
  }

  private mouseMove: [number, number] = [0, 0]
  private mouseCoords: [number, number] = [0, 0]
  private pointerCoords: number[] = [0, 0]
  private nbrOfPointers = 0

  constructor(canvas: HTMLCanvasElement, scale: number) {
    this.canvas = canvas
    this.scale = scale
    const gl = canvas.getContext('webgl2')
    if (!gl) throw new Error('WebGL2 not supported in this browser.')
    this.gl = gl
    this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale)
  }

  updateShader(source: string) {
    this.reset()
    this.shaderSource = source
    this.setup()
    this.init()
  }

  updateMove(deltas: [number, number]) { this.mouseMove = deltas }
  updateMouse(coords: [number, number]) { this.mouseCoords = coords }
  updatePointerCoords(coords: number[]) { this.pointerCoords = coords }
  updatePointerCount(nbr: number) { this.nbrOfPointers = nbr }
  updateScale(scale: number) {
    this.scale = scale
    this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale)
  }

  private compile(shader: WebGLShader, source: string) {
    const gl = this.gl
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader)
      console.error('Shader compilation error:', error)
    }
  }

  test(source: string): string | null {
    const gl = this.gl
    const shader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    let result: string | null = null
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      result = gl.getShaderInfoLog(shader)
    }
    gl.deleteShader(shader)
    return result
  }

  reset() {
    const gl = this.gl
    if (this.program && !gl.getProgramParameter(this.program, gl.DELETE_STATUS)) {
      if (this.vs) { gl.detachShader(this.program, this.vs); gl.deleteShader(this.vs) }
      if (this.fs) { gl.detachShader(this.program, this.fs); gl.deleteShader(this.fs) }
      gl.deleteProgram(this.program)
    }
  }

  setup() {
    const gl = this.gl
    this.vs = gl.createShader(gl.VERTEX_SHADER)!
    this.fs = gl.createShader(gl.FRAGMENT_SHADER)!
    this.compile(this.vs, vertexSrc)
    this.compile(this.fs, this.shaderSource)
    this.program = gl.createProgram()!
    gl.attachShader(this.program, this.vs)
    gl.attachShader(this.program, this.fs)
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program))
    }
  }

  init() {
    const gl = this.gl
    const program = this.program!
    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)

    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    this.uniforms = {
      resolution:   gl.getUniformLocation(program, 'resolution'),
      time:         gl.getUniformLocation(program, 'time'),
      move:         gl.getUniformLocation(program, 'move'),
      touch:        gl.getUniformLocation(program, 'touch'),
      pointerCount: gl.getUniformLocation(program, 'pointerCount'),
      pointers:     gl.getUniformLocation(program, 'pointers'),
    }
  }

  render(now = 0) {
    const gl = this.gl
    const program = this.program
    if (!program || gl.getProgramParameter(program, gl.DELETE_STATUS)) return

    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)

    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height)
    gl.uniform1f(this.uniforms.time, now * 1e-3)
    gl.uniform2f(this.uniforms.move, this.mouseMove[0], this.mouseMove[1])
    gl.uniform2f(this.uniforms.touch, this.mouseCoords[0], this.mouseCoords[1])
    gl.uniform1i(this.uniforms.pointerCount, this.nbrOfPointers)
    gl.uniform2fv(this.uniforms.pointers, this.pointerCoords)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

class PointerHandler {
  private scale: number
  private active = false
  private pointers = new Map<number, [number, number]>()
  private lastCoords: [number, number] = [0, 0]
  private moves: [number, number] = [0, 0]

  constructor(element: HTMLCanvasElement, scale: number) {
    this.scale = scale
    const map = (el: HTMLCanvasElement, s: number, x: number, y: number): [number, number] =>
      [x * s, el.height - y * s]

    element.addEventListener('pointerdown', (e) => {
      this.active = true
      this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY))
    })
    element.addEventListener('pointerup', (e) => {
      if (this.count === 1) this.lastCoords = this.first
      this.pointers.delete(e.pointerId)
      this.active = this.pointers.size > 0
    })
    element.addEventListener('pointerleave', (e) => {
      if (this.count === 1) this.lastCoords = this.first
      this.pointers.delete(e.pointerId)
      this.active = this.pointers.size > 0
    })
    element.addEventListener('pointermove', (e) => {
      if (!this.active) return
      this.pointers.set(e.pointerId, map(element, this.scale, e.clientX, e.clientY))
      this.moves = [this.moves[0] + e.movementX, this.moves[1] + e.movementY]
    })
  }

  updateScale(scale: number) { this.scale = scale }

  get count() { return this.pointers.size }
  get move(): [number, number] { return this.moves }
  get coords(): number[] {
    return this.pointers.size > 0 ? Array.from(this.pointers.values()).flat() : [0, 0]
  }
  get first(): [number, number] {
    return this.pointers.values().next().value || this.lastCoords
  }
}

export default function Hero({ trustBadge, headline, subtitle, buttons, className = '' }: HeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number | null>(null)
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const pointersRef = useRef<PointerHandler | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: WebGLRenderer
    try {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio)
      renderer = new WebGLRenderer(canvas, dpr)
      rendererRef.current = renderer
      pointersRef.current = new PointerHandler(canvas, dpr)
    } catch (err) {
      // Browser without WebGL2 — leave the black background and bail out.
      console.warn('[animated-shader-hero] WebGL2 unavailable:', err)
      return
    }

    renderer.setup()
    renderer.init()

    const resize = () => {
      const dpr = Math.max(1, 0.5 * window.devicePixelRatio)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      renderer.updateScale(dpr)
      pointersRef.current?.updateScale(dpr)
    }
    resize()

    if (renderer.test(defaultShaderSource) === null) {
      renderer.updateShader(defaultShaderSource)
    }

    const loop = (now: number) => {
      const p = pointersRef.current
      if (!p) return
      renderer.updateMouse(p.first)
      renderer.updatePointerCount(p.count)
      renderer.updatePointerCoords(p.coords)
      renderer.updateMove(p.move)
      renderer.render(now)
      animationFrameRef.current = requestAnimationFrame(loop)
    }
    animationFrameRef.current = requestAnimationFrame(loop)

    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      renderer.reset()
    }
  }, [])

  return (
    <div className={`relative w-full h-screen overflow-hidden bg-black ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover touch-none"
        style={{ background: 'black' }}
      />

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-white px-5">
        {trustBadge && (
          <div className="mb-8 animate-fade-in-down">
            <div className="flex items-center gap-2 px-6 py-3 bg-amber-500/10 backdrop-blur-md border border-amber-300/30 rounded-full text-sm">
              {trustBadge.icons && (
                <div className="flex gap-1">
                  {trustBadge.icons.map((icon, i) => (
                    <span key={i} className="text-amber-200">{icon}</span>
                  ))}
                </div>
              )}
              <span className="text-amber-100" style={{ fontFamily: 'var(--font-display)' }}>{trustBadge.text}</span>
            </div>
          </div>
        )}

        <div className="text-center space-y-6 max-w-5xl mx-auto">
          <div className="space-y-2">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-amber-200 via-yellow-300 to-orange-300 bg-clip-text text-transparent animate-fade-in-up animation-delay-200" style={{ fontFamily: 'var(--font-display)' }}>
              {headline.line1}
            </h1>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-yellow-200 via-orange-300 to-rose-300 bg-clip-text text-transparent animate-fade-in-up animation-delay-400" style={{ fontFamily: 'var(--font-display)' }}>
              {headline.line2}
            </h1>
          </div>

          <div className="max-w-3xl mx-auto animate-fade-in-up animation-delay-600">
            <p className="text-lg md:text-xl lg:text-2xl text-amber-100/90 font-light leading-relaxed">
              {subtitle}
            </p>
          </div>

          {buttons && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10 animate-fade-in-up animation-delay-800">
              {buttons.primary && (
                <button
                  onClick={buttons.primary.onClick}
                  className="px-8 py-4 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-500 hover:to-orange-500 text-black rounded-full font-semibold text-base md:text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-amber-500/25"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {buttons.primary.text}
                </button>
              )}
              {buttons.secondary && (
                <button
                  onClick={buttons.secondary.onClick}
                  className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/30 hover:border-white/50 text-amber-50 rounded-full font-semibold text-base md:text-lg transition-all duration-300 hover:scale-105 backdrop-blur-sm"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {buttons.secondary.text}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
