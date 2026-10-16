//! 將 JavaScript 的收縮、搬運與開殼軌跡改寫為 Rust。
use crate::asset::{Asset, Role};
use three_d::*;
#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
    Carry,
    Rest,
    Salvage,
}
impl Mode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Carry => "搬運前進",
            Self::Rest => "靜止呼吸",
            Self::Salvage => "回收碎片",
        }
    }
}
pub struct State {
    pub mode: Mode,
    pub speed: f32,
    pub opening: f32,
    pub rain: bool,
    pub paused: bool,
    pub orbit: bool,
    pub light: f32,
    pub time: f32,
    pub opened: f32,
}
impl Default for State {
    fn default() -> Self {
        Self {
            mode: Mode::Carry,
            speed: 0.75,
            opening: 0.,
            rain: false,
            paused: false,
            orbit: false,
            light: 2.8,
            time: 0.,
            opened: 0.,
        }
    }
}
impl State {
    pub fn advance(&mut self, dt: f32) {
        if !self.paused {
            self.time += dt.clamp(0., 0.05) * self.speed;
        }
        self.opened += (self.opening - self.opened) * (1. - (-4. * dt).exp());
    }
}
pub struct Pose {
    pub transforms: Vec<Mat4>,
    pub dynamic: Vec<Option<(Vec<Vec3>, Vec<Vec3>)>>,
}
fn point(m: Mat4, p: Vec3) -> Vec3 {
    (m * p.extend(1.)).truncate()
}
pub fn tube(start: Vec3, end: Vec3, time: f32, index: usize) -> (Vec<Vec3>, Vec<Vec3>) {
    let tangent = (end - start).normalize();
    let mut normal = tangent.cross(vec3(0., 1., 0.));
    if normal.magnitude2() < 0.01 {
        normal = vec3(1., 0., 0.);
    }
    normal = normal.normalize();
    let binormal = tangent.cross(normal);
    let (mut p, mut n) = (Vec::with_capacity(126), Vec::with_capacity(126));
    for j in 0..=20 {
        let u = j as f32 / 20.;
        let mut v = start + (end - start) * u;
        v.y += (u * std::f32::consts::PI).sin() * (0.12 + 0.06 * (time * 1.8 + index as f32).sin());
        v.x += (u * std::f32::consts::TAU + time + index as f32).sin()
            * 0.035
            * (u * std::f32::consts::PI).sin();
        for k in 0..=5 {
            let a = k as f32 / 5. * std::f32::consts::TAU;
            let direction = normal * a.cos() + binormal * a.sin();
            p.push(v + direction * (0.016 * (1. - u * 0.55)));
            n.push(direction);
        }
    }
    (p, n)
}
pub fn pose(asset: &Asset, state: &State) -> Pose {
    let t = state.time;
    let moving = state.mode != Mode::Rest;
    let amp = if moving { 0.1 } else { 0.018 };
    let o = state.opened;
    let global =
        Mat4::from_translation(vec3(
            if moving { (t * 0.2).sin() * 0.35 } else { 0. },
            0.,
            0.,
        )) * Mat4::from_angle_y(radians(if moving { (t * 0.14).sin() * 0.05 } else { 0. }));
    let mut deltas = Vec::new();
    let mut endpoints = Vec::new();
    for (i, &base) in asset.shell_origins.iter().enumerate() {
        let a = i as f32 * 2.39996;
        let pulse = (t * 1.6 + base.x * 1.5 + base.z).sin();
        let harvest = if state.mode == Mode::Salvage {
            (t * 0.8 + i as f32).sin().max(0.) * 0.22
        } else {
            0.
        };
        let mut destination = base
            + vec3(
                a.cos() * o * 1.15 + pulse * amp,
                o * (0.35 + base.x.abs() * 0.16) + pulse.max(0.) * amp + harvest,
                a.sin() * o * 0.95,
            );
        if moving && i % 6 == 0 && o < 0.1 {
            let u = (t * 0.13 + i as f32 * 0.17).fract();
            if u < 0.22 {
                let v = u / 0.22;
                destination = vec3(3.1, 0.08, a.sin() * 1.2) * (1. - v) + base * v;
                destination.y += (v * std::f32::consts::PI).sin() * 0.5;
            } else if u > 0.78 {
                let v = (u - 0.78) / 0.22;
                destination = base * (1. - v) + vec3(-3.1, 0.08, a.sin() * 1.3) * v;
                destination.y += (v * std::f32::consts::PI).sin() * 0.3;
            }
        }
        let tilt = o * a.cos() * 0.55 + (t + i as f32).sin() * amp * 0.4;
        deltas.push(
            Mat4::from_translation(destination)
                * Mat4::from_angle_z(radians(tilt))
                * Mat4::from_translation(-base),
        );
        endpoints.push(destination);
    }
    let mut transforms = Vec::new();
    let mut dynamic = Vec::new();
    for (i, g) in asset.model.geometries.iter().enumerate() {
        let bind = g.transformation;
        let mut mesh = None;
        let transform = match asset.roles[i] {
            Role::Static => global * bind,
            Role::Membrane => {
                global
                    * Mat4::from_nonuniform_scale(
                        1.,
                        1. + (t * 1.4).sin() * 0.055,
                        1. + (t * 1.4 + 0.4).sin() * 0.018,
                    )
                    * bind
            }
            Role::Shell(id) => global * deltas[id] * bind,
            Role::Strand(id) => {
                if let CpuGeometry::Triangles(cpu) = &g.geometry {
                    let positions = cpu.positions.to_f32();
                    let start = positions[..6]
                        .iter()
                        .fold(vec3(0., 0., 0.), |sum, &p| sum + point(bind, p))
                        / 6.;
                    let end = if id < 34 {
                        endpoints[id]
                    } else {
                        let a = (id - 34) as f32 / 18. * std::f32::consts::TAU;
                        vec3(
                            a.cos() * (2.7 + (t + id as f32).sin() * amp),
                            0.02 + (t * 1.7 + id as f32).sin().max(0.) * 0.1,
                            a.sin() * 2.3,
                        )
                    };
                    mesh = Some(tube(start, end, t, id));
                }
                global
            }
        };
        transforms.push(transform);
        dynamic.push(mesh);
    }
    Pose {
        transforms,
        dynamic,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_asset_preserves_meshes_and_dynamic_strands() {
        let a = Asset::load().unwrap();
        assert_eq!(a.model.geometries.len(), 193);
        assert_eq!(a.shell_origins.len(), 34);
        assert_eq!(
            a.roles
                .iter()
                .filter(|r| matches!(r, Role::Strand(_)))
                .count(),
            52
        );
        let p = pose(&a, &State::default());
        assert_eq!(p.dynamic.iter().flatten().count(), 52);
        for item in p.dynamic.iter().flatten() {
            assert_eq!(item.0.len(), 126);
            assert!(item
                .0
                .iter()
                .all(|v| v.x.is_finite() && v.y.is_finite() && v.z.is_finite()));
        }
    }
    #[test]
    fn pause_freezes_time_and_opening_exposes_shells() {
        let mut s = State::default();
        s.paused = true;
        s.advance(0.02);
        assert_eq!(s.time, 0.);
        s.opening = 1.;
        for _ in 0..200 {
            s.advance(0.02);
        }
        assert!((s.opened - 1.).abs() < 0.001);
    }
}
