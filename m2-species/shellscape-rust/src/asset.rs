//! GLB 模型資產與匯出。不執行 JavaScript，也不需瀏覽器。
use serde_json::{json, Value};
use std::{error::Error, fs, path::Path};
use three_d::*;

pub type Result<T> = std::result::Result<T, Box<dyn Error>>;
#[derive(Clone, Copy, Debug)]
pub enum Role {
    Static,
    Membrane,
    Shell(usize),
    Strand(usize),
}

pub struct Asset {
    pub document: Value,
    pub binary: Vec<u8>,
    pub model: CpuModel,
    pub roles: Vec<Role>,
    pub node_ids: Vec<usize>,
    pub shell_origins: Vec<Vec3>,
}
fn read_u32(bytes: &[u8], offset: usize) -> Result<usize> {
    Ok(u32::from_le_bytes(
        bytes
            .get(offset..offset + 4)
            .ok_or("Truncated GLB")?
            .try_into()?,
    ) as usize)
}
pub fn encode(document: &Value, binary: &[u8]) -> Result<Vec<u8>> {
    let mut text = serde_json::to_vec(document)?;
    while text.len() % 4 != 0 {
        text.push(b' ');
    }
    let mut bin = binary.to_vec();
    while bin.len() % 4 != 0 {
        bin.push(0);
    }
    let mut output = Vec::new();
    for value in [
        0x46546c67_u32,
        2,
        (12 + 8 + text.len() + 8 + bin.len()) as u32,
        text.len() as u32,
        0x4e4f534a,
    ] {
        output.extend(value.to_le_bytes());
    }
    output.extend(text);
    output.extend((bin.len() as u32).to_le_bytes());
    output.extend(0x004e4942_u32.to_le_bytes());
    output.extend(bin);
    Ok(output)
}
fn mat(value: &Value) -> Mat4 {
    let mut a = [0.0f32; 16];
    for (i, v) in value.as_array().unwrap().iter().enumerate() {
        a[i] = v.as_f64().unwrap() as f32;
    }
    Mat4::new(
        a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13],
        a[14], a[15],
    )
}
fn tag_tree(nodes: &[Value], roles: &mut [Role], id: usize, role: Role) {
    roles[id] = role;
    if let Some(children) = nodes[id]["children"].as_array() {
        for c in children {
            tag_tree(nodes, roles, c.as_u64().unwrap() as usize, role);
        }
    }
}
fn name_primitives(node: &mut three_d_asset::Node, inherited: &str) {
    if node.geometry.is_some() {
        node.name = inherited.to_owned();
    }
    let name = node.name.clone();
    for c in &mut node.children {
        name_primitives(c, &name);
    }
}
impl Asset {
    pub fn load() -> Result<Self> {
        let bytes = include_bytes!("../assets/shellscape.glb");
        if read_u32(bytes, 0)? != 0x46546c67 || read_u32(bytes, 4)? != 2 {
            return Err("Expected glTF 2.0 binary".into());
        }
        let len = read_u32(bytes, 12)?;
        let mut document: Value = serde_json::from_slice(&bytes[20..20 + len])?;
        let bin_len = read_u32(bytes, 20 + len)?;
        let binary = bytes
            .get(28 + len..28 + len + bin_len)
            .ok_or("Missing binary buffer")?
            .to_vec();
        let nodes = document["nodes"].as_array().ok_or("Missing nodes")?.clone();
        let roots = document["scenes"][0]["nodes"]
            .as_array()
            .ok_or("Missing scene roots")?;
        let root = roots[0].as_u64().ok_or("Missing root")? as usize;
        let root_mat = nodes[root]
            .get("matrix")
            .map(mat)
            .unwrap_or(Mat4::identity());
        let children = nodes[root]["children"]
            .as_array()
            .ok_or("Missing body parts")?;
        let mut node_roles = vec![Role::Static; nodes.len()];
        let mut shell_origins = Vec::new();
        for id in children {
            let id = id.as_u64().unwrap() as usize;
            if nodes[id]["name"] == "LivingMembrane" {
                node_roles[id] = Role::Membrane;
            }
            if nodes[id].get("children").is_some() {
                let origin = root_mat
                    * nodes[id].get("matrix").map(mat).unwrap_or(Mat4::identity())
                    * vec4(0., 0., 0., 1.);
                let i = shell_origins.len();
                shell_origins.push(origin.truncate());
                tag_tree(&nodes, &mut node_roles, id, Role::Shell(i));
            }
        }
        if shell_origins.len() != 34 {
            return Err("Unexpected model: expected 34 shell groups".into());
        }
        for (i, id) in children[children.len() - 52..].iter().enumerate() {
            node_roles[id.as_u64().unwrap() as usize] = Role::Strand(i);
        }
        for (i, node) in document["nodes"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .enumerate()
        {
            node["name"] = json!(format!("part_{i}"));
        }
        let mut raw = three_d_asset::io::RawAssets::new();
        raw.insert("shellscape.glb", encode(&document, &binary)?);
        let mut scene: three_d_asset::Scene = raw.deserialize("shellscape.glb")?;
        for node in &mut scene.children {
            name_primitives(node, "");
        }
        let model: CpuModel = scene.into();
        let node_ids: Vec<usize> = model
            .geometries
            .iter()
            .map(|g| {
                g.name
                    .strip_prefix("part_")
                    .ok_or("Missing part name")?
                    .parse()
                    .map_err(|_| "Invalid part name")
            })
            .collect::<std::result::Result<_, _>>()?;
        let roles = node_ids.iter().map(|&i| node_roles[i]).collect();
        Ok(Self {
            document,
            binary,
            model,
            roles,
            node_ids,
            shell_origins,
        })
    }
    /// 輸出目前姿態。維持所有原始貼圖並更新牽引絲頂點。
    pub fn export(
        &self,
        path: &Path,
        transforms: &[Mat4],
        dynamic: &[Option<(Vec<Vec3>, Vec<Vec3>)>],
    ) -> Result<()> {
        let mut doc = self.document.clone();
        let mut bin = self.binary.clone();
        let mut nodes = Vec::new();
        for (i, &id) in self.node_ids.iter().enumerate() {
            let mut n = doc["nodes"][id].clone();
            n.as_object_mut().unwrap().remove("children");
            for key in ["translation", "rotation", "scale"] {
                n.as_object_mut().unwrap().remove(key);
            }
            let m = transforms[i];
            let arr: [f32; 16] = [
                m.x.x, m.x.y, m.x.z, m.x.w, m.y.x, m.y.y, m.y.z, m.y.w, m.z.x, m.z.y, m.z.z, m.z.w,
                m.w.x, m.w.y, m.w.z, m.w.w,
            ];
            n["matrix"] = json!(arr);
            nodes.push(n.clone());
            if let Some((positions, normals)) = &dynamic[i] {
                let mesh = n["mesh"].as_u64().unwrap() as usize;
                for (key, values) in [("POSITION", positions), ("NORMAL", normals)] {
                    let accessor = doc["meshes"][mesh]["primitives"][0]["attributes"][key]
                        .as_u64()
                        .ok_or("Missing dynamic attribute")?
                        as usize;
                    write_vectors(&mut doc, &mut bin, accessor, values)?;
                }
            }
        }
        doc["nodes"] = json!(nodes);
        doc["scenes"] =
            json!([{"name":"Shellscape Rust pose","nodes":(0..nodes.len()).collect::<Vec<_>>()}]);
        doc["scene"] = json!(0);
        doc["asset"]["generator"] = json!("Shellscape Rust native pose exporter");
        fs::write(path, encode(&doc, &bin)?)?;
        Ok(())
    }
}
fn write_vectors(doc: &mut Value, bin: &mut [u8], accessor: usize, values: &[Vec3]) -> Result<()> {
    let a = &doc["accessors"][accessor];
    if a["count"].as_u64() != Some(values.len() as u64)
        || a["componentType"] != 5126
        || a["type"] != "VEC3"
    {
        return Err("Unexpected dynamic accessor layout".into());
    }
    let view = &doc["bufferViews"][a["bufferView"].as_u64().unwrap() as usize];
    let start = view["byteOffset"].as_u64().unwrap_or(0) as usize
        + a["byteOffset"].as_u64().unwrap_or(0) as usize;
    let stride = view["byteStride"].as_u64().unwrap_or(12) as usize;
    let (mut min, mut max) = ([f32::INFINITY; 3], [f32::NEG_INFINITY; 3]);
    for (i, p) in values.iter().enumerate() {
        for (j, v) in [p.x, p.y, p.z].into_iter().enumerate() {
            let at = start + i * stride + j * 4;
            bin.get_mut(at..at + 4)
                .ok_or("Dynamic buffer out of range")?
                .copy_from_slice(&v.to_le_bytes());
            min[j] = min[j].min(v);
            max[j] = max[j].max(v);
        }
    }
    if doc["accessors"][accessor].get("min").is_some() {
        doc["accessors"][accessor]["min"] = json!(min);
        doc["accessors"][accessor]["max"] = json!(max);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn open_pose_glb_reimports_with_textures_and_updated_strands() {
        let asset = Asset::load().unwrap();
        let mut state = crate::motion::State::default();
        state.opening = 1.0;
        state.opened = 1.0;
        state.time = 3.5;
        let pose = crate::motion::pose(&asset, &state);
        let path = std::env::temp_dir().join(format!(
            "shellscape-rust-roundtrip-{}.glb",
            std::process::id()
        ));
        asset
            .export(&path, &pose.transforms, &pose.dynamic)
            .unwrap();
        let bytes = fs::read(&path).unwrap();
        let len = read_u32(&bytes, 12).unwrap();
        let doc: Value = serde_json::from_slice(&bytes[20..20 + len]).unwrap();
        assert_eq!(doc["images"], asset.document["images"]);
        assert_eq!(doc["textures"], asset.document["textures"]);
        let mut raw = three_d_asset::io::RawAssets::new();
        raw.insert("roundtrip.glb", bytes);
        let model: CpuModel = raw.deserialize("roundtrip.glb").unwrap();
        assert_eq!(model.geometries.len(), asset.model.geometries.len());
        assert_eq!(model.materials.len(), asset.model.materials.len());
        for (i, g) in model.geometries.iter().enumerate() {
            if let Some((expected, _)) = &pose.dynamic[i] {
                if let CpuGeometry::Triangles(cpu) = &g.geometry {
                    let positions = cpu.positions.to_f32();
                    assert_eq!(positions.len(), expected.len());
                    assert!((positions[0] - expected[0]).magnitude() < 0.00001);
                }
            }
        }
    }
}
