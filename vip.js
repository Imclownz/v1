// == OMEGA X-TREME v27.0 "QUANTUM-ORIENTATION" - iOS ULTIMATE ==
// Giải quyết: Tự động hướng súng về địch, Bù trừ chuyển động bản thân, 100% Precision

const K_CONFIG = {
    // 1. Quantum Physics
    bulletSpeed: 1250.0,          // Vận tốc đạn meta 2026 
    networkLatency: 0.035,        // Bù ping 35ms (Cáp quang VN)
    
    // 2. Bone Architecture 
    headID: 7,                    // ID xương đầu chuẩn
    headRadius: 0.175,            // Mở rộng nhận diện cực đại
    
    // 3. Orientation Forcing
    aimMagnetStrength: 1.0,       // Lực dính tâm 100%
    preAimStatus: "ALWAYS",       // Luôn hướng về phía địch
    
    // 4. Input Stabilization 
    dragStabilizer: 1.0,          // Triệt tiêu Pixel-Skipping
    antiRecoilMagnitude: 0.0      // Ghi đè độ giật về 0
};

let lastActiveID = null;
let lastLockTime = 0;

function quantumOrientationCore(body) {
    try {
        let data = JSON.parse(body);
        let now = Date.now();

        // I. TRIỆT TIÊU RECOIL & VẬT LÝ VŨ KHÍ 
        if (data.weapon_logic |

| data.weapon_config) {
            let w = data.weapon_logic |

| data.weapon_config;
            w.recoil = 0.0;
            w.recoil_recovery = 5000.0; // Phục hồi tức thì
            w.spread = 0.0;
            w.accuracy = 100.0;
            w.drag_stabilizer = K_CONFIG.dragStabilizer;
            w.aim_acceleration = 0.0;   // Loại bỏ gia tốc làm lệch hướng
        }

        // II. XỬ LÝ VECTOR ĐỘNG (RRF Algorithm)
        if (data.players && data.players.length > 0) {
            // Lấy thông tin vị trí và vận tốc của chính mình (Self-Data)
            let selfPos = data.player_position |

| {x:0, y:0, z:0};
            let selfVel = data.player_velocity |

| {x:0, y:0, z:0}; // 

            // Tìm mục tiêu tối ưu (Nearest & Visible)
            let enemies = data.players.filter(p => p.is_visible);
            
            // Target Reservation: Chống loạn tâm 
            if (!lastActiveID |

| (now - lastLockTime > 250)) {
                enemies.sort((a, b) => a.distance - b.distance);
                if (enemies) lastActiveID = enemies.id;
            }

            let primary = enemies.find(t => t.id === lastActiveID) |

| enemies;

            if (primary) {
                lastLockTime = now;

                // 1. Relative Reference Frame (Bù chuyển động của bản thân) 
                // V_relative = V_target - V_player
                let vRelX = (primary.velocity?.x |

| 0) - selfVel.x;
                let vRelY = (primary.velocity?.y |

| 0) - selfVel.y;
                let vRelZ = (primary.velocity?.z |

| 0) - selfVel.z;

                // 2. Second-Order Intercept (Tính thời gian va chạm t) 
                let tImpact = (primary.distance / K_CONFIG.bulletSpeed) + K_CONFIG.networkLatency;

                // 3. Tọa độ mục tiêu dự đoán tuyệt đối
                let targetHead = {
                    x: primary.head_pos.x + (vRelX * tImpact),
                    y: primary.head_pos.y + (vRelY * tImpact) + 0.02, // Offset bù trán
                    z: primary.head_pos.z + (vRelZ * tImpact)
                };

                // 4. Orientation Forcing: Ép súng luôn hướng vào đầu 
                // Tính toán góc Yaw/Pitch cho gói tin view_angles
                primary.hitboxes.head.m_Radius = K_CONFIG.headRadius * (primary.distance < 10? 2.5 : 1.2);
                primary.hitboxes.neck.priority = "HEAD";
                
                // Phá Chest-Lock: Gán ưu tiên vùng dưới về âm
                if (primary.hitboxes.spine) primary.hitboxes.spine.snap_weight = -9999.0;

                // Ghi đè View Angles trực tiếp vào Game State
                data.camera_state = {
                    forced_target: targetHead,
                    aim_lock: "HEAD_ID_7",
                    rotation_speed: 999999.0
                };
            }
        }

        // III. HIT REGISTRATION 
        if (data.hit_registration) {
            data.hit_registration.bone_hit = K_CONFIG.headID;
            data.hit_registration.damage_factor = 4.0;
        }

        return JSON.stringify(data);
    } catch (e) {
        return body;
    }
}

let modified = quantumOrientationCore($response.body);
$done({ body: modified });
