//! 借殼地貌：原生 Rust 模型觀察器，無 JavaScript 或影片功能。
mod asset;
mod motion;
use asset::{Asset, Result, Role};
use motion::{Mode, State};
use std::{
    fs,
    path::{Path, PathBuf},
};
use three_d::*;
fn output_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Desktop/借殼地貌-Rust")
}
fn configure_gui(ctx: &egui::Context) {
    for path in [
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ] {
        if let Ok(bytes) = fs::read(path) {
            let mut f = egui::FontDefinitions::default();
            f.font_data
                .insert("cjk".into(), egui::FontData::from_owned(bytes));
            f.families
                .entry(egui::FontFamily::Proportional)
                .or_default()
                .insert(0, "cjk".into());
            ctx.set_fonts(f);
            break;
        }
    }
    let mut s = (*ctx.style()).clone();
    s.visuals = egui::Visuals::dark();
    s.visuals.panel_fill = egui::Color32::from_rgb(22, 32, 29);
    s.visuals.selection.bg_fill = egui::Color32::from_rgb(73, 102, 84);
    s.spacing.item_spacing = egui::vec2(10.0, 12.0);
    ctx.set_style(s);
}
fn main() {
    if let Err(e) = run() {
        eprintln!("借殼地貌啟動失敗：{e}");
        std::process::exit(1);
    }
}
fn run() -> Result<()> {
    let asset = Asset::load()?;
    let args: Vec<String> = std::env::args().collect();
    if let Some(at) = args.iter().position(|s| s == "--export") {
        let path = args
            .get(at + 1)
            .ok_or("Usage: shellscape --export OUTPUT.glb [--open-shell]")?;
        let mut s = State::default();
        if args.iter().any(|s| s == "--open-shell") {
            s.opening = 1.0;
            s.opened = 1.0;
        }
        let p = motion::pose(&asset, &s);
        asset.export(Path::new(path), &p.transforms, &p.dynamic)?;
        println!("已匯出：{path}，{} 個網格", asset.model.geometries.len());
        return Ok(());
    }
    let window = Window::new(WindowSettings {
        title: "借殼地貌 · Rust 生物觀察室".into(),
        min_size: (900, 600),
        max_size: Some((1440, 900)),
        ..Default::default()
    })?;
    let context = window.gl();
    let mut gui = GUI::new(&context);
    let mut font_ready = false;
    let home = vec3(7.8, 5.1, 9.2);
    let target = vec3(0.0, 0.65, 0.0);
    let up = vec3(0.0, 1.0, 0.0);
    let mut camera = Camera::new_perspective(
        window.viewport(),
        home,
        target,
        up,
        degrees(37.0),
        0.1,
        90.0,
    );
    let mut control = OrbitControl::new(target, 3.2, 19.0);
    let mut model = Model::<PhysicalMaterial>::new(&context, &asset.model)?;
    let mut ground = Gm::new(
        Mesh::new(&context, &CpuMesh::circle(96)),
        PhysicalMaterial::new_opaque(
            &context,
            &CpuMaterial {
                albedo: Srgba::new(62, 70, 57, 255),
                roughness: 0.93,
                ..Default::default()
            },
        ),
    );
    ground.set_transformation(
        Mat4::from_translation(vec3(0.0, -0.04, 0.0))
            * Mat4::from_angle_x(degrees(-90.0))
            * Mat4::from_scale(6.1),
    );
    let mut pebbles = Vec::new();
    for i in 0..95 {
        let a = i as f32 * 2.39996;
        let r = 3.15 + (i as f32 * 0.719).fract() * 2.75;
        let mut p = Gm::new(
            Mesh::new(&context, &CpuMesh::sphere(5)),
            PhysicalMaterial::new_opaque(
                &context,
                &CpuMaterial {
                    albedo: Srgba::new(106, 112, 100, 255),
                    roughness: 0.95,
                    ..Default::default()
                },
            ),
        );
        let size = 0.04 + (i % 6) as f32 * 0.018;
        p.set_transformation(
            Mat4::from_translation(vec3(a.cos() * r, 0.0, a.sin() * r))
                * Mat4::from_nonuniform_scale(size, size * 0.45, size),
        );
        pebbles.push(p);
    }
    let mut drops = Vec::new();
    for _ in 0..72 {
        drops.push(Gm::new(
            Mesh::new(&context, &CpuMesh::sphere(4)),
            PhysicalMaterial::new_opaque(
                &context,
                &CpuMaterial {
                    albedo: Srgba::new(148, 185, 174, 255),
                    roughness: 0.3,
                    ..Default::default()
                },
            ),
        ));
    }
    let ambient = AmbientLight::new(&context, 0.65, Srgba::new(177, 198, 207, 255));
    let mut sun = DirectionalLight::new(
        &context,
        2.8,
        Srgba::new(235, 226, 196, 255),
        vec3(-0.3, -1.0, -0.5),
    );
    let rim = DirectionalLight::new(
        &context,
        1.6,
        Srgba::new(181, 185, 237, 255),
        vec3(0.6, -0.5, 1.0),
    );
    let mut state = State::default();
    let mut status = "原生 Rust 模型；可離線操作".to_owned();
    let mut last = 0.0;
    let mut screenshot = false;
    window.render_loop(move |mut frame| {
        let dt = ((frame.accumulated_time - last) / 1000.0) as f32;
        last = frame.accumulated_time;
        let mut panel_width = 260.0;
        let mut export = false;
        let mut reset = false;
        gui.update(
            &mut frame.events,
            frame.accumulated_time,
            frame.viewport,
            frame.device_pixel_ratio,
            |ctx| {
                if !font_ready {
                    configure_gui(ctx);
                    font_ready = true;
                }
                egui::SidePanel::right("controls")
                    .default_width(260.0)
                    .resizable(false)
                    .show(ctx, |ui| {
                        ui.add_space(14.0);
                        ui.label(
                            egui::RichText::new("POST-HUMAN ECOLOGY")
                                .small()
                                .color(egui::Color32::from_rgb(175, 201, 179)),
                        );
                        ui.heading("借殼地貌");
                        ui.label("Rust 生物觀察室");
                        ui.separator();
                        egui::ComboBox::from_label("動作")
                            .selected_text(state.mode.label())
                            .show_ui(ui, |ui| {
                                for mode in [Mode::Carry, Mode::Rest, Mode::Salvage] {
                                    ui.selectable_value(&mut state.mode, mode, mode.label());
                                }
                            });
                        ui.add(egui::Slider::new(&mut state.speed, 0.1..=1.6).text("速度"));
                        ui.add(egui::Slider::new(&mut state.opening, 0.0..=1.0).text("外殼開合"));
                        ui.checkbox(&mut state.rain, "雨季補水");
                        ui.checkbox(&mut state.orbit, "自動環視");
                        ui.add(egui::Slider::new(&mut state.light, 0.5..=5.0).text("光線"));
                        ui.separator();
                        ui.horizontal(|ui| {
                            if ui
                                .button(if state.paused { "繼續" } else { "暫停" })
                                .clicked()
                            {
                                state.paused = !state.paused;
                            }
                            if ui.button("重新開始").clicked() {
                                state.time = 0.0;
                            }
                            if ui.button("重設視角").clicked() {
                                reset = true;
                            }
                        });
                        if ui
                            .button(if state.opening > 0.5 {
                                "收回外殼"
                            } else {
                                "打開外殼"
                            })
                            .clicked()
                        {
                            state.opening = if state.opening > 0.5 { 0.0 } else { 1.0 };
                        }
                        if ui.button("匯出目前姿態 GLB").clicked() {
                            export = true;
                        }
                        if ui.button("儲存模型圖片").clicked() {
                            screenshot = true;
                        }
                        ui.separator();
                        ui.label("拖曳旋轉，滾輪縮放");
                        ui.label("左鍵旋轉／右鍵平移");
                        ui.add_space(10.0);
                        ui.label(format!("{} 個模型網格", model.len()));
                        ui.label(if state.rain {
                            "雨季：外殼濕潤、內膜補水"
                        } else {
                            "乾季：蓄水碎片維持內膜濕潤"
                        });
                        ui.label(state.mode.label());
                        ui.separator();
                        ui.small(&status);
                        ui.small("科幻創作設定。動作為預設軌跡。");
                    });
                panel_width = ctx.used_rect().width();
            },
        );
        state.advance(dt);
        if reset {
            camera.set_view(home, target, up);
            state.orbit = false;
            control = OrbitControl::new(target, 3.2, 19.0);
        }
        let viewport = Viewport {
            x: 0,
            y: 0,
            width: frame
                .viewport
                .width
                .saturating_sub((panel_width * frame.device_pixel_ratio) as u32)
                .max(1),
            height: frame.viewport.height,
        };
        camera.set_viewport(viewport);
        control.handle_events(&mut camera, &mut frame.events);
        if state.orbit && !state.paused {
            let p = camera.position();
            let (s, c) = (dt * 0.12).sin_cos();
            camera.set_view(vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c), target, up);
        }
        let pose = motion::pose(&asset, &state);
        for (i, part) in model.iter_mut().enumerate() {
            part.set_transformation(pose.transforms[i]);
            if let Some((p, n)) = &pose.dynamic[i] {
                part.geometry.positions_mut().fill(p);
                if let Some(buffer) = part.geometry.normals_mut() {
                    buffer.fill(n);
                }
            }
            if matches!(asset.roles[i], Role::Membrane) {
                part.material.roughness = if state.rain { 0.13 } else { 0.28 };
            }
        }
        for (i, d) in drops.iter_mut().enumerate() {
            let i = i as f32;
            d.set_transformation(
                Mat4::from_translation(vec3(
                    (i * 1.71).sin() * 5.5,
                    6.0 - (state.time * 2.5 + i * 0.37) % 6.0,
                    (i * 2.13).cos() * 5.5,
                )) * Mat4::from_nonuniform_scale(0.012, 0.07, 0.012),
            );
        }
        sun.intensity = state.light;
        sun.generate_shadow_map(1024, model.iter().map(|p| &p.geometry));
        let lights: [&dyn Light; 3] = [&ambient, &sun, &rim];
        let screen = frame.screen();
        let objects: Vec<&dyn Object> = model
            .iter()
            .map(|p| p as &dyn Object)
            .chain(std::iter::once(&ground as &dyn Object))
            .chain(pebbles.iter().map(|p| p as &dyn Object))
            .chain(
                drops
                    .iter()
                    .filter(|_| state.rain)
                    .map(|p| p as &dyn Object),
            )
            .collect();
        screen
            .clear(ClearState::color_and_depth(0.035, 0.055, 0.047, 1.0, 1.0))
            .render(&camera, objects, &lights);
        if screenshot {
            screenshot = false;
            let result = (|| -> Result<PathBuf> {
                let dir = output_dir();
                fs::create_dir_all(&dir)?;
                let path = dir.join("借殼地貌-Rust.png");
                let pixels = screen.read_color_partially::<[u8; 4]>(ScissorBox {
                    x: 0,
                    y: 0,
                    width: viewport.width,
                    height: viewport.height,
                });
                let texture = CpuTexture {
                    data: TextureData::RgbaU8(pixels),
                    width: viewport.width,
                    height: viewport.height,
                    ..Default::default()
                };
                three_d_asset::io::serialize_and_save(&path, texture)?;
                Ok(path)
            })();
            status = match result {
                Ok(p) => format!("圖片已儲存：{}", p.display()),
                Err(e) => format!("圖片儲存失敗：{e}"),
            };
        }
        screen.write(|| gui.render()).unwrap();
        if export {
            let result = (|| -> Result<PathBuf> {
                let dir = output_dir();
                fs::create_dir_all(&dir)?;
                let path = dir.join("借殼地貌-Rust.glb");
                asset.export(&path, &pose.transforms, &pose.dynamic)?;
                Ok(path)
            })();
            status = match result {
                Ok(p) => format!("GLB 已儲存：{}", p.display()),
                Err(e) => format!("匯出失敗：{e}"),
            };
        }
        FrameOutput::default()
    });
    Ok(())
}
