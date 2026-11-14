// Flat, crisp light on every lit material, patched into three's shader
// chunks once, before any material compiles: the field, the scene lab and
// the part labs all import this, so they share one look. Drop the import
// for the physical look.
//
// The look is FLAT's numbers, live (one uniform every standard material
// reads), so the scene lab (scene.html) slides them and the field wears
// what it last set (saved in the browser under FLAT_KEY, like the palette).
// Paste the lab's "copy look" block over FLAT_DEFAULTS to make it permanent.
//
//   wrap    0 = the true falloff (dark exactly side-on to the key light),
//           1 = still half lit side-on
//   bands   the lit side cut into this many flat tones (a 3DS game's two:
//           lit and shade); under 2, the smooth falloff
//   edge    where the shade starts, as a share of the wrapped light: lower
//           = more of the statue lit
//   soft    how wide each band's edge is (0 = a hard line)
//   shadow  the key's shadow pushed to a crisp line: 0 = the soft shadow
//           map as it is, 1 = a hard edge (the softness is what keeps it
//           from stepping along the texels)
//   sky     the skylight split into its sky and ground colours at the
//           horizon instead of blending between them: 0 = blended, 1 = split
//   lamp    a point light's (the lanterns') falloff flattened: 0 = the
//           inverse-square fade as it is, 1 = a flat disc of light, as
//           bright as the fade was halfway out, with nothing past its edge
//   lampEdge where that disc ends, as a share of the light's reach; its
//           edge is `soft` wide (of the reach)
//   lampPower a lantern's lamp's brightness, lit (a three point light's intensity)
//   pool    how bright the warm pool on the ground round a lit lantern's
//           foot is (poolTexture draws it: fading, or a flat disc, as
//           `lamp` has it)
// The shine is gone whatever the numbers: no specular from the key or the
// sky.
import { ShaderChunk, ShaderLib, CanvasTexture, MathUtils } from "three";

export const FLAT_KEY = "flat-lab"; // where the scene lab keeps the look in localStorage
export const FLAT_DEFAULTS = Object.freeze({
  wrap: 0.4,
  bands: 1,
  edge: 0.04,
  soft: 0,
  shadow: 1,
  sky: 0.07,
  lamp: 0.28,
  lampEdge: 0.17,
  lampPower: 70,
  pool: 0.14,
});
export const FLAT = { ...FLAT_DEFAULTS };
const KEYS = Object.keys(FLAT_DEFAULTS);
const SHADER_KEYS = KEYS.slice(0, 8); // the numbers the shaders read (the rest the lamps and pools read in JS)
// What the lab last saved, over the defaults
try {
  const saved = JSON.parse(localStorage.getItem(FLAT_KEY) || "{}")?.F;
  if (saved && typeof saved === "object") for (const k of KEYS) if (typeof saved[k] === "number") FLAT[k] = saved[k];
} catch {
  /* no storage: the defaults */
}

// The one uniform, shared by reference: cloneUniforms copies a typed array
// as is (it clones Colors, Vectors and the like, and slices plain arrays),
// so every material's copy of ShaderLib's uniforms points at this array
// and a write here reaches them all on the next frame
const u = new Float32Array(SHADER_KEYS.length);
export function setFlat(partial = {}) {
  Object.assign(FLAT, partial);
  SHADER_KEYS.forEach((k, i) => (u[i] = FLAT[k]));
}
setFlat();
for (const name of ["standard", "physical", "lambert", "phong", "toon"]) ShaderLib[name].uniforms.uFlat = { value: u };

const swap = (chunk, from, to) => {
  const src = ShaderChunk[chunk];
  if (!src.includes(from)) throw new Error(`flatlight.js: three's ${chunk} has changed; "${from.trim().slice(0, 50)}…" not found`);
  ShaderChunk[chunk] = src.replace(from, to);
};

// The uniform and the helpers, declared at the top of the light chunk
// every lit fragment shader includes first
ShaderChunk.lights_pars_begin =
  `uniform float uFlat[${SHADER_KEYS.length}]; // flatlight.js: ${SHADER_KEYS.join(", ")}
#define FLAT_WRAP uFlat[0]
#define FLAT_BANDS uFlat[1]
#define FLAT_EDGE uFlat[2]
#define FLAT_SOFT max( uFlat[3], 0.001 )
#define FLAT_SHADOW uFlat[4]
#define FLAT_SKY uFlat[5]
#define FLAT_LAMP uFlat[6]
#define FLAT_LAMP_EDGE uFlat[7]
// The lit amount (0 – 1) cut into FLAT_BANDS flat tones: shade under
// FLAT_EDGE, the rest split evenly, each edge FLAT_SOFT wide
float flatBands( float x ) {
	if ( FLAT_BANDS < 2.0 ) return x;
	float n = FLAT_BANDS - 1.0;
	float span = max( 1.0 - FLAT_EDGE, 0.001 );
	float t = ( x - FLAT_EDGE ) / span * n;
	float s = FLAT_SOFT / span * n;
	float q = 0.0;
	for ( int k = 0; k < 7; k ++ ) if ( float( k ) < n ) q += smoothstep( float( k ) - s, float( k ) + s, t );
	return q / n;
}
// The soft shadow map's edge pushed to a crisp line
float flatShadow( float s ) {
	float w = mix( 0.5, 0.01, FLAT_SHADOW );
	return mix( s, smoothstep( 0.5 - w, 0.5 + w, s ), FLAT_SHADOW );
}
` + ShaderChunk.lights_pars_begin;

// The skylight: sky above the horizon, ground below, split or blended
swap(
  "lights_pars_begin",
  "float hemiDiffuseWeight = 0.5 * dotNL + 0.5;",
  "float hemiDiffuseWeight = 0.5 * dotNL + 0.5;\n\t\themiDiffuseWeight = mix( hemiDiffuseWeight, smoothstep( 0.5 - FLAT_SOFT, 0.5 + FLAT_SOFT, hemiDiffuseWeight ), FLAT_SKY );",
);

// A point light's falloff: the smooth fade, or a flat disc of light
// (defined after three's getDistanceAttenuation, which it uses)
swap(
  "lights_pars_begin",
  "float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {",
  `float flatLamp( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float fade = getDistanceAttenuation( lightDistance, cutoffDistance, decayExponent );
	if ( FLAT_LAMP <= 0.0 || cutoffDistance <= 0.0 ) return fade;
	float edge = cutoffDistance * FLAT_LAMP_EDGE;
	float level = getDistanceAttenuation( edge * 0.5, cutoffDistance, decayExponent );
	float s = FLAT_SOFT * cutoffDistance;
	float disc = level * ( 1.0 - smoothstep( edge - s, edge + s, lightDistance ) );
	return mix( fade, disc, FLAT_LAMP );
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {`,
);
swap(
  "lights_pars_begin",
  "light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );",
  "light.color *= flatLamp( lightDistance, pointLight.distance, pointLight.decay );",
);

// The pool of light on the ground round a lit lantern's foot, as a
// texture for a flat disc: white, its alpha fading out from the middle
// (1 there, 0.35 at 0.45, 0 at the edge), or, as far as FLAT.lamp has it,
// a flat disc with an edge FLAT.soft wide. Drawn when asked, so a lab can
// draw it again as the knobs move
export function poolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d"),
    img = x.createImageData(64, 64);
  const soft = (r) => (r < 0.45 ? 1 - (r / 0.45) * 0.65 : Math.max(0, 0.35 * (1 - (r - 0.45) / 0.55)));
  const w = Math.max(FLAT.soft, 0.01) * 2;
  const flat = (r) => 1 - MathUtils.smoothstep(r, 0.85 - w, 0.85 + w);
  for (let j = 0; j < 64; j++)
    for (let i = 0; i < 64; i++) {
      const r = Math.hypot(i + 0.5 - 32, j + 0.5 - 32) / 32,
        o = (j * 64 + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(MathUtils.lerp(soft(r), flat(r), FLAT.lamp) * 255);
    }
  x.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

// The key light's shadow, crisped
swap(
  "lights_fragment_begin",
  "directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;",
  "directLight.color *= ( directLight.visible && receiveShadow ) ? flatShadow( getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) ) : 1.0;",
);

// The key light's falloff: wrapped round past side-on, then cut into bands
swap(
  "lights_physical_pars_fragment",
  "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
  "float dotNL = flatBands( saturate( ( dot( geometryNormal, directLight.direction ) + FLAT_WRAP ) / ( 1.0 + FLAT_WRAP ) ) );",
);
// No shine, from the key or the sky
swap("lights_physical_pars_fragment", "reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );", "");
swap("lights_physical_pars_fragment", "reflectedLight.indirectSpecular += radiance * singleScattering;", "");
swap("lights_physical_pars_fragment", "reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;", "");
// The skylight's diffuse is no longer dimmed by the shine it would have spent
swap(
  "lights_physical_pars_fragment",
  "vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );",
  "vec3 diffuse = material.diffuseColor;",
);
