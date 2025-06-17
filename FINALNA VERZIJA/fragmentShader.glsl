precision mediump float;
uniform sampler2D u_sampler;
uniform bool u_useTexture;
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambientColor;
uniform vec3 u_eye;
varying vec2 v_texCoord;
varying vec4 v_color;
varying vec3 v_normal;
varying vec3 v_position;

void main() {
    vec3 N = normalize(v_normal);
    vec3 L = normalize(u_lightDir);
    vec3 V = normalize(u_eye - v_position);
    vec3 R = reflect(-L, N);

    float diff = max(dot(N, L), 0.0);
    float spec = 0.0;
    if(diff > 0.0) {
        spec = pow(max(dot(R, V), 0.0), 32.0);
    }

    vec3 ambient = u_ambientColor;
    vec3 diffuse = u_lightColor * diff;
    vec3 specular = u_lightColor * spec * 0.5;

    vec4 baseColor = u_useTexture ? texture2D(u_sampler, v_texCoord) : v_color;
    vec3 finalColor = baseColor.rgb * (ambient + diffuse) + specular;
    gl_FragColor = vec4(finalColor, baseColor.a);
}