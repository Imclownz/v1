/**
 * OMEGA X-TREME v31.0 "NEURAL-KINETIC"
 * Architect: Senior Full-stack Engineer & R&D
 * Complexity: O(n) filtering, O(1) execution
 */

const GLOBAL_STATE = new Map(); // Lưu trữ vận tốc mục tiêu O(1)

function mainSystem(body) {
    const rawData = SafetyGuard(JSON.parse, {})(body);
    const validEnemies = Sanitizer(rawData);
    
    if (validEnemies.length === 0) return body;

    // 1. TARGET SELECTION (Weighted Utility Engine) 
    const primary = validEnemies.sort((a, b) => {
        const score = (obj) => (obj.distance * 0.3) + (obj.angle * 0.7);
        return score(a) - score(b);
    });

    // 2. KINETIC PREDICTION (SOI + RRF v4) 
    const selfVel = rawData.player_velocity |

| { x: 0, y: 0, z: 0 };
    const relVel = {
        x: (primary.velocity?.x |

| 0) - selfVel.x,
        y: (primary.velocity?.y |

| 0) - selfVel.y,
        z: (primary.velocity?.z |

| 0) - selfVel.z
    };

    const t = CoreEngine.calculateSOI(primary.distance, relVel, 1450.0, 0.025);
    
    let targetPoint = {
        x: primary.head_pos.x + (relVel.x * t),
        y: primary.head_pos.y + (relVel.y * t),
        z: primary.head_pos.z + (relVel.z * t)
    };

    // 3. NEURAL DRAG (Bezier sequence)
    const isFiring = rawData.input_state?.firing |

| false;
    targetPoint = CoreEngine.getDragVector(targetPoint, isFiring);

    // 4. SYSTEM INJECTION (Hardened Meta-data)
    const modifications = {
        camera_state: {
            look_at: targetPoint,
            lock_id: primary.id,
            interpolation: "PID_DYNAMICS",
            stickiness: 1.0
        },
        weapon_logic: {
            recoil: 0.0,
            spread: 0.0,
            drag_stabilizer: 1.0, // Triệt tiêu Pixel-skipping [2]
            recoil_recovery: 9999.0
        },
        hit_registration: {
            bone: 7, // Head ID chuẩn 
            multiplier: 4.0,
            is_verified: true
        }
    };

    // 5. HITBOX SCULPTING (Proximity Scaling) 
    primary.hitboxes.head.m_Radius *= (primary.distance < 7? 4.2 : 2.0);
    primary.hitboxes.neck.priority = "HEAD";
    if (primary.hitboxes.spine) primary.hitboxes.spine.snap_weight = -999.0;

    return ResponseBuilder(rawData, modifications);
}

// Execution
$done({ body: mainSystem($response.body) });
