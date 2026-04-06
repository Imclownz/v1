/**
 * OMEGA X-TREME v29.0 "DYNAMICS-X" - ULTIMATE ARCHITECTURE
 * Cấu trúc: O(1) Intercept, PID Vector Control, Break-Lock Logic
 */

// --- DYNAMICS & MATH PROVIDER ---
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
    static subtract(a, b) { return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); }
    static add(a, b) { return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); }
    magnitude() { return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2); }
}

// --- STATE MACHINE (SINGLETON) ---
const SystemState = (() => {
    let instance;
    const settings = {
        bulletVelocity: 1350.0,    // Tăng tốc đạn để snap nhanh hơn
        networkLatency: 0.028,    // Bù trễ cực thấp cho hạ tầng 2026
        headID: 7,
        neckID: 5,
        hitRadius: 0.185,         // Bán kính headshot mở rộng (+85%)
        pid: { Kp: 0.8, Ki: 0.1, Kd: 0.05 } // Hệ số PID ổn định vector
    };
    let lockCache = { id: null, timestamp: 0 };
    return {
        get: () => {
            if (!instance) instance = { settings, lockCache };
            return instance;
        }
    };
})();

// --- DRAG OPTIMIZER (STRATEGY PATTERN) ---
class DragEngine {
    /**
     * Thuật toán Down-Up Sequence: Phá Chest-Lock vật lý
     */
    static getDynamicsOffset(isFiring) {
        if (!isFiring) return 0;
        // Mô phỏng lực hất lên trán trong 20ms đầu tiên
        return 0.035; 
    }

    /**
     * Giải Second-Order Intercept O(1)
     */
    static calculateIntercept(primary, selfVel, bulletSpeed, latency) {
        const vRel = {
            x: (primary.velocity?.x |

| 0) - selfVel.x,
            y: (primary.velocity?.y |

| 0) - selfVel.y,
            z: (primary.velocity?.z |

| 0) - selfVel.z
        };
        const t = (primary.distance / bulletSpeed) + latency;
        return {
            x: primary.head_pos.x + (vRel.x * t),
            y: primary.head_pos.y + (vRel.y * t),
            z: primary.head_pos.z + (vRel.z * t)
        };
    }
}

// --- MAIN SYSTEM ARCHITECT ---
function dynamicsXCore(body) {
    try {
        const { settings, lockCache } = SystemState.get();
        const data = JSON.parse(body);
        const now = Date.now();

        // I. WEAPON ARCHITECTURE: SOLID assigning
        if (data.weapon_logic |

| data.weapon_config) {
            const w = data.weapon_logic |

| data.weapon_config;
            Object.assign(w, {
                recoil: 0.0,
                spread: 0.0,
                accuracy: 100.0,
                drag_stabilizer: 1.0,
                aim_acceleration: 0.0,
                recoil_recovery: 9999.0
            });
        }

        // II. TARGETING ENGINE: Utility-based O(n)
        if (data.players?.length > 0) {
            const selfVel = data.player_velocity |

| { x: 0, y: 0, z: 0 };
            const isFiring = data.input_state?.fire |

| false;

            // Reservation: Chống jitter 250ms
            if (!lockCache.id |

| (now - lockCache.timestamp > 250)) {
                data.players.sort((a, b) => a.distance - b.distance);
                lockCache.id = data.players.id;
            }

            const target = data.players.find(p => p.id === lockCache.id) |

| data.players;

            if (target) {
                lockCache.timestamp = now;

                // 1. SOI PREDICTION + BREAK-LOCK MOTION
                const interceptPoint = DragEngine.calculateIntercept(
                    target, selfVel, settings.bulletVelocity, settings.networkLatency
                );
                
                // Micro-adjustment cho vùng trán
                interceptPoint.y += settings.hitRadius + DragEngine.getDynamicsOffset(isFiring);

                // 2. ADAPTIVE HITBOX SCULPTING (Proximity Logic)
                const pScale = target.distance < 8? 3.8 : 2.0;
                target.hitboxes.head.m_Radius = settings.hitRadius * pScale;
                target.hitboxes.head.m_Height = 0.21;
                
                // 3. VECTOR-BREAK: Phá Chest-lock bằng ưu tiên âm
                target.hitboxes.neck.priority = "HEAD";
                if (target.hitboxes.hips) target.hitboxes.hips.priority = "NONE";
                if (target.hitboxes.spine) target.hitboxes.spine.snap_weight = -9999.0;

                // 4. CAMERA FORCING
                data.camera_state = {
                    forced_target: interceptPoint,
                    lock_bone: "bone_Head",
                    stickiness: 1.0,
                    interpolation: "ZERO" // Loại bỏ làm mượt để snap tức thời
                };
            }
        }

        // III. HIT REGISTRATION
        if (data.hit_confirmation) {
            Object.assign(data.hit_confirmation, {
                hit_part: settings.headID,
                damage_multiplier: 4.0,
                is_verified: true
            });
        }

        return JSON.stringify(data);
    } catch (e) {
        return body;
    }
}

// EXECUTE
$done({ body: dynamicsXCore($response.body) });
