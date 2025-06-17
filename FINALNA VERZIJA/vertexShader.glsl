attribute vec3 a_position;
attribute vec2 a_texCoord;
attribute vec3 a_normal;
uniform mat4 u_mvpMatrix;
uniform mat4 u_modelMatrix;
uniform vec4 u_color;
varying vec2 v_texCoord;
varying vec4 v_color;
varying vec3 v_normal;
varying vec3 v_position;

void main() {
    gl_Position = u_mvpMatrix * vec4(a_position, 1.0);
    v_texCoord = a_texCoord;
    v_color = u_color;
    v_normal = mat3(u_modelMatrix) * a_normal;
    v_position = vec3(u_modelMatrix * vec4(a_position, 1.0));
}