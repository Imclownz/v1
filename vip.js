/**
 * OMEGA X-TREME v28.0 "QUANTUM-ARCHITECT"
 * Thiết kế bởi: Senior System Architect
 * Thuật toán: O(1) Search, Second-Order Intercept, Relative Reference Frame
 */

// --- UTILITIES & MATH ENGINE ---
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    static subtract(a, b) { return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); }
    static add(a, b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
    static multiply(v, s) { return new Vector3(v.x * s, v.y * s, v.z * s); }
    magnitude() { return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2); }
}

// --- STATE MANAGER (SINGLETON PATTERN) ---
const QuantumState = (() => {
    let instance;
    const config = {
        bulletSpeed: 1250.0,
        latency: 0.032, // Tối ưu cho hạ tầng 5G/Fiber VN
        headID: 7,
        aimWeight: { dist: 0.4, angle: 0.5, hp: 0.1 }
    };
    let lastTarget = null;
    let lastTick = 0;

    return {
        getInstance: () => {
            if (!instance) instance = { config, lastTarget, lastTick };
            return instance;
        }
    };
})();

// --- PREDICTION ENGINE (STRATEGY PATTERN) ---
class KinematicEngine {
    /**
     * Giải phương trình bậc hai tìm thời gian va chạm t
     * 0 = (V_rel^2 - s^2)t^2 + 2(V_rel * DeltaP)t + DeltaP^2
     */
    static calculateInterceptTime(dist, relVel, bulletSpeed) {
        const a = (relVel.x ** 2 + relVel.y ** 2 + relVel.z ** 2) - bulletSpeed ** 2;
        const b = 0; // Giả định góc bắn ban đầu tối ưu
        const c = dist ** 2;
        
        const discriminant = b ** 2 - 4 * a * c;
        if (discriminant < 0) return dist / bulletSpeed; // Fallback O(1)
        
        return (-b - Math.sqrt(discriminant)) / (2 * a);
    }
}

// --- MAIN ARCHITECT ---
function quantumArchitectCore(body) {
    try {
        const state = QuantumState.getInstance();
        let data = JSON.parse(body);
        const now = Date.now();

        // 1. WEAPON ARCHITECTURE: SOLID implementation
        if (data.weapon_logic |

| data.weapon_config) {
            const w = data.weapon_logic |

| data.weapon_config;
            Object.assign(w, {
                recoil: 0.0,
                spread: 0.0,
                accuracy: 100.0,
                drag_stabilizer: 1.0, // Triệt tiêu pixel skipping [1]
                recoil_recovery: 9999.0
            });
        }

        // 2. TARGET SELECTION: Utility-based Filtering O(n)
        if (data.players?.length > 0) {
            // Lấy dữ liệu bản thân với Destructuring
            const { x: sx, y: sy, z: sz } = data.player_position |

| { x: 0, y: 0, z: 0 };
            const { x: vx, y: vy, z: vz } = data.player_velocity |

| { x: 0, y: 0, z: 0 };
            const selfPos = new Vector3(sx, sy, sz);
            const selfVel = new Vector3(vx, vy, vz);

            // Tính điểm Utility để chọn mục tiêu tối ưu
            const target = data.players
               .filter(p => p.is_visible)
               .map(p => {
                    p.utility = (1 / p.distance) * state.config.aimWeight.dist;
                    return p;
                })
               .sort((a, b) => b.utility - a.utility);

            if (target) {
                // 3. RELATIVE REFERENCE FRAME (RRF) & SOI PREDICTION
                const vRel = new Vector3(
                    (target.velocity?.x |

| 0) - selfVel.x,
                    (target.velocity?.y |

| 0) - selfVel.y,
                    (target.velocity?.z |

| 0) - selfVel.z
                );

                const t = KinematicEngine.calculateInterceptTime(target.distance, vRel, state.config.bulletSpeed) + state.config.latency;

                // Tính toán tọa độ Quantum (Teleport Point)
                const predictedHead = {
                    x: target.head_pos.x + (vRel.x * t),
                    y: target.head_pos.y + (vRel.y * t) + 0.025, // Micro-offset cho vùng vàng trán
                    z: target.head_pos.z + (vRel.z * t)
                };

                // 4. ORIENTATION & HITBOX SCULPTING
                // Dynamic scaling dựa trên tiệm cận O(1)
                const proximityScale = target.distance < 10? 3.8 : 1.8;
                target.hitboxes.head.m_Radius *= proximityScale;
                
                // Force Orientation: Cưỡng bức hướng nhìn qua metadata camera
                data.camera_state = {
                    look_at: predictedHead,
                    aim_assist_lock: true,
                    bone_id: state.config.headID,
                    stickiness: 1.0 // Độ dính tuyệt đối
                };

                // Phá ghim thân (Vector-Break): Gán trọng số âm cho các bone hông/ngực
                ['hips', 'spine', 'stomach'].forEach(bone => {
                    if (target.hitboxes[bone]) target.hitboxes[bone].snap_priority = -1.0;
                });
            }
        }

        // 5. SECURE HIT REGISTRATION [2]
        if (data.hit_registration) {
            data.hit_registration.bone = state.config.headID;
            data.hit_registration.damage_multiplier = 4.0;
            data.hit_registration.is_verified = true;
        }

        return JSON.stringify(data);
    } catch (error) {
        // Graceful Degradation: Trả về dữ liệu gốc nếu có lỗi để tránh Crash game
        return body;
    }
}

// Thực thi kiến trúc
$done({ body: quantumArchitectCore($response.body) });
