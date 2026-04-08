/**
 * ==============================================================================
 * APEX-X KINETIC ARCHITECTURE v37.0 (SMOOTH CEILING EDITION)
 * Core: Hyper-Drag Acceleration + Asymptotic Soft-Landing + Absolute Anchor
 * Goal: Trợ lực vuốt siêu tốc, giới hạn đầu tuyệt đối, ZERO Jitter.
 * ==============================================================================
 */

if (typeof $response === "undefined") { var $response = { body: '{}' }; }
if (typeof $done === "undefined") { var $done = function(obj) { return obj; }; }

// ==========================================
// 1. KINETIC CORE (Zero-Allocation GC-Free)
// ==========================================
const ResultBuffer = new Float64Array(3);
const KINETIC_ITERATIONS = 3;

class ApexKinematics {
    static lastVx = 0; static lastVy = 0; static lastVz = 0;

    static fastIntercept(tx, ty, tz, tvx, tvy, tvz, ax, ay, az, sx, sy, sz, svx, svy, svz, vBullet) {
        const alpha = 0.65;
        let smoothVx = (tvx * alpha) + (this.lastVx * (1 - alpha));
        let smoothVy = (tvy * alpha) + (this.lastVy * (1 - alpha));
        let smoothVz = (tvz * alpha) + (this.lastVz * (1 - alpha));
        
        this.lastVx = smoothVx; this.lastVy = smoothVy; this.lastVz = smoothVz;

        let rVx = smoothVx - svx; let rVy = smoothVy - svy; let rVz = smoothVz - svz;
        let dx = tx - sx; let dy = ty - sy; let dz = tz - sz;
        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        let maxPredictionTime = dist < 15 ? 0.05 : 0.12; 
        let t = Math.min(dist / vBullet, maxPredictionTime);

        let t2, fx, fy, fz;
        for (let i = 0; i < KINETIC_ITERATIONS; i = i + 1) {
            t2 = t * t;
            fx = tx + rVx * t + 0.5 * ax * t2;
            fy = ty + rVy * t + 0.5 * ay * t2;
            fz = tz + rVz * t + 0.5 * az * t2;

            dx = fx - sx; dy = fy - sy; dz = fz - sz;
            dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            t = Math.min(dist / vBullet, maxPredictionTime);
        }

        t2 = t * t;
        ResultBuffer[0] = tx + rVx * t + 0.5 * ax * t2; 
        ResultBuffer[1] = ty + rVy * t + 0.5 * ay * t2; 
        ResultBuffer[2] = tz + rVz * t + 0.5 * az * t2; 

        return ResultBuffer;
    }
}

// ==========================================
// 2. APEX CONTROLLER - v37.0 DYNAMICS
// ==========================================
class ApexController {
    constructor() {
        this.config = {
            bulletSpeed: 999999.0,
            goldenRatio: 0.66,          // Điểm khóa trán
            
            // Hyper-Drag Params
            baseDragBoost: 8.5,         // Vuốt nhẹ: Lực đẩy cơ bản
            hardDragThreshold: 0.15,    // Ngưỡng nhận diện "vuốt cực mạnh"
            hyperDragMultiplier: 45.0,  // Trợ lực hàm mũ khi vuốt mạnh (x45 lần)
            counterGravityForce: 0.08,  // Lực đẩy tối thiểu tự động
            
            // Soft-Landing Params
            dampeningZone: 0.12,        // Bắt đầu giảm tốc khi cách đầu 0.12m
            horizontalFunnel: 0.90      
        };
    }

    annihilateBodyHitboxes(hitboxes) {
        if (!hitboxes) return;
        ['spine', 'hips', 'chest', 'pelvis'].forEach(part => {
            if (hitboxes[part]) {
                hitboxes[part].snap_weight = -999999.0;
                hitboxes[part].priority = "NONE";
                hitboxes[part].m_Radius = 0.0001; 
                hitboxes[part].m_Height = 0.0001;
            }
        });
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.snap_weight = 999999999.0;
            hitboxes.head.m_Radius *= 8.0; 
        }
        if (hitboxes.neck) hitboxes.neck.priority = "HEAD";
    }

    processFrame(data) {
        // TRIỆT TIÊU RUNG GIẬT GỐC (Native Shake/Recoil)
        if (data.weapon) {
            data.weapon.recoil = 0.0; data.weapon.recoil_multiplier = 0.0;
            data.weapon.camera_shake = 0.0; data.weapon.aim_acceleration = 0.0;
            data.weapon.spread = 0.0;
        }
        if (data.gameState) {
            data.gameState.weaponRecoil = 0.0; data.gameState.cameraShake = 0.0;
            data.gameState.shakeIntensity = 0.0;
        }

        const players = data.players || data.targets || [];
        if (players.length === 0) return data;
        
        players.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const target = players[0];
        if (!target.position && !target.headHitbox) return data;

        const tPos = target.headHitbox || target.position;
        const tVel = target.velocity || {x:0, y:0, z:0};
        const tAcc = target.acceleration || {x:0, y:0, z:0}; 
        const sPos = data.playerPosition || {x:0, y:0, z:0};
        const sVel = data.playerVelocity || {x:0, y:0, z:0}; 

        this.annihilateBodyHitboxes(target.hitboxes);

        const interceptPoint = ApexKinematics.fastIntercept(
            tPos.x, tPos.y, tPos.z, tVel.x, tVel.y, tVel.z, tAcc.x, tAcc.y, tAcc.z,
            sPos.x, sPos.y, sPos.z, sVel.x, sVel.y, sVel.z, this.config.bulletSpeed
        );

        const headHeight = (target.headHitbox && target.headHitbox.radius) ? target.headHitbox.radius : 0.2;
        const targetHeadY = interceptPoint[1] + (headHeight * this.config.goldenRatio);

        let finalAimX = interceptPoint[0];
        let finalAimY = targetHeadY;
        let finalAimZ = interceptPoint[2];
        
        if (data.input_state && data.input_state.isFiring) {
            let currentAimY = data.currentAimPosition ? data.currentAimPosition.y : sPos.y;
            let currentAimX = data.currentAimPosition ? data.currentAimPosition.x : sPos.x;
            
            let userDragY = data.input_state.deltaY || 0; 
            let distanceToHead = targetHeadY - currentAimY;

            // ========================================================
            // PHASE 1 & 2: DYNAMIC ASSIST & SOFT-LANDING
            // ========================================================
            if (distanceToHead > 0.015) { 
                let appliedForceY = userDragY;

                // Cấp số nhân cho "Trợ lực kéo cực mạnh"
                if (userDragY > this.config.hardDragThreshold) {
                    // Gia tốc Hyper-Drag: Vuốt càng mạnh, hệ số nhân càng khủng khiếp (Non-linear)
                    appliedForceY = Math.pow(userDragY, 1.5) * this.config.hyperDragMultiplier;
                } else {
                    appliedForceY = userDragY * this.config.baseDragBoost;
                }

                // Lực đối kháng tĩnh
                appliedForceY = Math.max(appliedForceY, this.config.counterGravityForce);

                // SOFT-LANDING (Chống sốc Engine gây rung giật)
                // Nếu cách đầu < 0.12m, lực kéo bị mài mòn tiệm cận về 0 để tâm lướt vào đầu êm ái
                if (distanceToHead < this.config.dampeningZone) {
                    let dampeningFactor = distanceToHead / this.config.dampeningZone; 
                    appliedForceY *= dampeningFactor; // Lực sẽ giảm dần (Ví dụ: 1.0 -> 0.5 -> 0.1)
                }

                data.input_state.deltaY = Math.min(appliedForceY, distanceToHead);

                // Phễu từ tính trục ngang
                let distanceToTargetX = targetHeadX - currentAimX;
                data.input_state.deltaX = distanceToTargetX * this.config.horizontalFunnel; 

                finalAimY = currentAimY + data.input_state.deltaY;
                
            } 
            // ========================================================
            // PHASE 3: ABSOLUTE ANCHOR (Giới hạn tuyệt đối, Zero Jitter)
            // ========================================================
            else {
                // Khi đã chạm vùng an toàn (khoảng cách <= 0.015m)
                // Cắt đứt HOÀN TOÀN lực đẩy và trớn (momentum) của Game Engine
                data.input_state.deltaY = 0; 
                data.input_state.deltaX = 0; 
                
                // Tiêu diệt các biến gia tốc camera gốc (nếu Engine game có) để chống giật
                if (data.input_state.pitch !== undefined) data.input_state.pitch = 0;
                if (data.input_state.yaw !== undefined) data.input_state.yaw = 0;
                
                finalAimY = targetHeadY;
                finalAimX = targetHeadX;
                finalAimZ = interceptPoint[2];
            }
        }

        const finalAimPosition = { x: finalAimX, y: finalAimY, z: finalAimZ };

        data.aimPosition = finalAimPosition;
        data.camera_state = {
            forced_target: finalAimPosition,
            lock_bone: "bone_Head",
            stickiness: 1.0,           
            tracking_mode: "ABSOLUTE", 
            interpolation: "ZERO"      // Tắt nội suy mượt của game, dùng nội suy toán học của ta
        };

        data.isHeadshot = true;
        data.forceHit = true;
        data.hitLocation = "head";
        
        return data;
    }
}

const SystemCore = new ApexController();
if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        $done({ body: JSON.stringify(SystemCore.processFrame(payload)) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
