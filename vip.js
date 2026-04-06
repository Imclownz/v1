// == OMEGA X-TREME v25.0 "QUANTUM-LOCK" - ULTIMATE JS ==
// Khắc phục: Ghim thân dưới, Jitter khi đông người, Sai số di chuyển nhanh

const Q_CONFIG = {
    // 1. Quantum Hitbox (Bone ID: 7 - Head)
    headBone: "bone_Head",
    neckBone: "bone_Neck",
    headRadius: 0.145,             // Mở rộng động +45% 
    snapForce: 9999999.0,          // Lực snap tuyệt đối
    
    // 2. Anti-Body Logic (Phá ghim thân dưới)
    bodyRejection: -999.0,         // Lực đẩy âm ra khỏi vùng hips/spine
    stickinessBypass: 1.0,         // Ép độ dính tâm vào đầu = 100%
    
    // 3. Dự đoán chuyển động bậc hai (I2 Prediction)
    bulletVelocity: 1100.0,        // Vận tốc đạn chuẩn meta 2026
    pingCompensation: 0.045,       // Bù trễ mạng 45ms
    
    // 4. Target Reservation (Chống loạn mục tiêu)
    lockTime: 250,                 // Giữ mục tiêu trong 250ms
    fovRange: 110                  // Góc quét 110 độ
};

let activeTarget = null;
let lastUpdate = 0;

function quantumLockCore(body) {
    try {
        let data = JSON.parse(body);
        let now = Date.now();

        // I. VÔ HIỆU HÓA RECOIL & STABILIZE DRAG
        if (data.weapon_logic |

| data.weapon_config) {
            let w = data.weapon_logic |

| data.weapon_config;
            w.recoil = 0.0;
            w.recoil_recovery = 1000.0; // Phục hồi tâm tức thì
            w.spread = 0.0;
            w.accuracy = 100.0;
            w.drag_stabilizer = 1.0;    // Triệt tiêu pixel skipping
            w.aim_acceleration = 0.0;   // Loại bỏ gia tốc làm lệch tâm
        }

        // II. XỬ LÝ NHIỀU MỤC TIÊU & SNAP
        if (data.players && data.players.length > 0) {
            let potentialTargets = data.players.filter(p => p.is_visible);
            
            // Reservation Logic: Chống jitter
            if (!activeTarget |

| (now - lastUpdate > Q_CONFIG.lockTime)) {
                activeTarget = potentialTargets.sort((a, b) => a.distance - b.distance);
            }

            if (activeTarget) {
                lastUpdate = now;

                // 1. Proximity Hitbox Scaling (Càng gần hitbox càng to)
                let scale = activeTarget.distance < 8? 3.0 : 1.8;

                // 2. I2 Lead Prediction (Dự đoán intercept đạn)
                if (activeTarget.velocity) {
                    let impactT = (activeTarget.distance / Q_CONFIG.bulletVelocity) + Q_CONFIG.pingCompensation;
                    activeTarget.head_pos.x += activeTarget.velocity.x * impactT;
                    activeTarget.head_pos.y += (activeTarget.velocity.y * impactT) + 0.015; // Offset bù trán
                    activeTarget.head_pos.z += activeTarget.velocity.z * impactT;
                }

                // 3. Teleport & Anti-Body Forcing
                activeTarget.hitboxes.head.m_Radius = Q_CONFIG.headRadius * scale;
                activeTarget.hitboxes.neck.priority = "HEAD";
                
                // Phá Aim-Lock thân dưới: Gán ưu tiên vùng dưới về 0
                if (activeTarget.hitboxes.hips) activeTarget.hitboxes.hips.priority = "NONE";
                if (activeTarget.hitboxes.spine) activeTarget.hitboxes.spine.snap_weight = Q_CONFIG.bodyRejection;
                
                // Force Lock Status
                data.aim_state = {
                    locked_bone: Q_CONFIG.headBone,
                    snap_speed: Q_CONFIG.snapForce,
                    magnet_status: "ACTIVE"
                };
            }
        }

        // III. GHI ĐÈ SÁT THƯƠNG TRỰC TIẾP
        if (data.hit_registration) {
            data.hit_registration.hit_box = 7; // Head ID
            data.hit_registration.damage_multiplier = 4.0;
        }

        return JSON.stringify(data);
    } catch (e) {
        return body;
    }
}

let modified = quantumLockCore($response.body);
$done({ body: modified });
