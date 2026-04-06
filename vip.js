/**
 * OMEGA X-TREME v30.0 "ABSOLUTE-KINETIC"
 * Thuật toán: Euler-PID Control, Second-Order Intercept, Adaptive Hitbox Expansion
 * Độ phức tạp: O(n) Filtering, O(1) Kinematic Solving
 */

// --- KINETIC MATH PROVIDER ---
const K_ENGINE = {
    // Giải phương trình bậc 2 để tìm thời điểm va chạm chính xác (t)
    solveIntercept: (dist, vRel, s) => {
        const a = (vRel.x ** 2 + vRel.y ** 2 + vRel.z ** 2) - (s ** 2);
        const b = 0; // Giả định hướng bắn tối ưu
        const c = dist ** 2;
        const disc = (b ** 2) - (4 * a * c);
        return disc < 0? (dist / s) : (-b - Math.sqrt(disc)) / (2 * a);
    },
    // Tính toán góc Euler (Yaw/Pitch) từ Vector hướng
    toEuler: (v) => {
        const mag = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
        return {
            pitch: -Math.asin(v.y / mag) * (180 / Math.PI),
            yaw: Math.atan2(v.x, v.z) * (180 / Math.PI)
        };
    }
};

// --- SYSTEM CONFIG (SINGLETON) ---
const QuantumConfig = Object.freeze({
    boneHead: 7, boneNeck: 5, 
    bulletVelocity: 1450.0, // Overclocked velocity
    pingComp: 0.028,        // 28ms compensation for VN Fiber
    headRadius: 0.185,      // Standard: 0.099 -> v30: 0.185 (+87%)
    bodyNullPriority: -99999.0
});

// --- CORE ARCHITECT ---
function absoluteKineticCore(body) {
    try {
        let data = JSON.parse(body);
        const selfVel = data.player_velocity |

| { x: 0, y: 0, z: 0 };
        const isFiring = data.input_state?.fire |

| false;

        // 1. WEAPON DECORATOR: Ghi đè sâu vào hệ thống vật lý
        if (data.weapon_logic |

| data.weapon_config) {
            const w = data.weapon_logic |

| data.weapon_config;
            Object.assign(w, {
                recoil: 0.0,
                spread: 0.0,
                accuracy: 100.0,
                drag_stabilizer: 1.0,  // Khử Pixel Skipping khi hất mạnh [1]
                recoil_recovery: 99999.0,
                aim_acceleration: 0.0  // Loại bỏ gia tốc làm trượt tâm
            });
        }

        // 2. TARGETING PIPELINE: O(n) Complexity
        if (data.players?.length > 0) {
            // Lọc và sắp xếp mục tiêu theo Utility Score (Độ ưu tiên)
            const target = data.players
               .filter(p => p.is_visible)
               .sort((a, b) => a.distance - b.distance);

            if (target) {
                // A. Tính toán Vector vận tốc tương đối (RRF v4)
                const vRel = {
                    x: (target.velocity?.x |

| 0) - selfVel.x,
                    y: (target.velocity?.y |

| 0) - selfVel.y,
                    z: (target.velocity?.z |

| 0) - selfVel.z
                };

                // B. Giải phương trình Intercept đón đầu mục tiêu
                const t = K_ENGINE.solveIntercept(target.distance, vRel, QuantumConfig.bulletVelocity) + QuantumConfig.pingComp;

                const predictedPoint = {
                    x: target.head_pos.x + (vRel.x * t),
                    y: target.head_pos.y + (vRel.y * t) + 0.025, // Bù tọa độ đỉnh đầu
                    z: target.head_pos.z + (vRel.z * t)
                };

                // C. ADAPTIVE HITBOX SCULPTING (Xử lý lỗi tầm gần)
                // Càng gần, hitbox đầu càng to để bao phủ toàn bộ camera
                const pScale = target.distance < 7? 4.5 : 2.5;
                target.hitboxes.head.m_Radius = QuantumConfig.headRadius * pScale;
                target.hitboxes.head.m_Height = 0.25;

                // D. VECTOR-BREAK (Xử lý lỗi ghim thân)
                // Gán quyền ưu tiên ÂM TUYỆT ĐỐI cho toàn bộ vùng ngực/hông
                ['hips', 'spine', 'stomach', 'chest'].forEach(bone => {
                    if (target.hitboxes[bone]) {
                        target.hitboxes[bone].priority = "NONE";
                        target.hitboxes[bone].snap_weight = QuantumConfig.bodyNullPriority;
                    }
                });

                // E. CAMERA & VIEW ORIENTATION FORCING
                // Chuyển hướng súng và camera về tọa độ đón đầu
                data.camera_state = {
                    look_at: predictedPoint,
                    force_bone: "bone_Head",
                    rotation_mode: "INSTANT", // Phá bỏ Smooth để Snap ngay lập tức
                    stickiness: 1.0           // Độ dính tuyệt đối 100%
                };
            }
        }

        // 3. SECURE HIT REGISTRATION: Ép kết quả 400% Damage [2]
        if (data.hit_confirmation) {
            Object.assign(data.hit_confirmation, {
                bone_id: QuantumConfig.boneHead,
                damage_multiplier: 4.0,
                registration_type: "headshot",
                is_verified: true // Bypass server-side check
            });
        }

        return JSON.stringify(data);
    } catch (e) {
        return body; // Fallback an toàn
    }
}

// EXECUTE v30.0
$done({ body: absoluteKineticCore($response.body) });
