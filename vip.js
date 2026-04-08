/**
 * ==============================================================================
 * APEX-X KINETIC ARCHITECTURE v36.0 (ABSOLUTE CEILING EDITION)
 * Core: Dynamic Delta Clamping + Hitbox Nullification + Zero Recoil
 * Goal: Ép tâm trượt cực nhanh lên đầu, triệt tiêu lực kéo xuống, chống vượt đầu 100%
 * ==============================================================================
 */

if (typeof $response === "undefined") { var $response = { body: '{}' }; }
if (typeof $done === "undefined") { var $done = function(obj) { return obj; }; }

// ==========================================
// 1. KINETIC CORE (Zero-Allocation)
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
// 2. APEX CONTROLLER
// ==========================================
class ApexController {
    constructor() {
        this.config = {
            bulletSpeed: 999999.0,
            goldenRatio: 0.66,          // Điểm khóa hoàn hảo: 2/3 phần trên của đầu
            dragBoostFactor: 25.0,      // Nhân lực kéo lên cực mạnh (x25 lần)
            counterGravityForce: 0.08,  // Lực đối kháng tự động đẩy tâm lên khi đang bắn
            horizontalFunnel: 0.90      // 90% lực gom ngang để theo sát địch lách
        };
    }

    /**
     * Tiêu hủy cấu trúc hình học của thân dưới, bơm tối đa cho Đầu
     */
    annihilateBodyHitboxes(hitboxes) {
        if (!hitboxes) return;
        ['spine', 'hips', 'chest', 'pelvis'].forEach(part => {
            if (hitboxes[part]) {
                // Triệt tiêu lực hút
                hitboxes[part].snap_weight = -999999.0;
                hitboxes[part].priority = "NONE";
                // Bóp nát kích thước khối hộp về hạt cát để game không nhận diện được
                hitboxes[part].m_Radius = 0.0001; 
                hitboxes[part].m_Height = 0.0001;
            }
        });
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.snap_weight = 999999999.0;
            hitboxes.head.m_Radius *= 8.0; // Phóng to khối nhận diện đầu x8
        }
        if (hitboxes.neck) hitboxes.neck.priority = "HEAD";
    }

    processFrame(data) {
        // ========================================================
        // I. TRIỆT TIÊU TOÀN BỘ YẾU TỐ VẬT LÝ GÂY RUNG GIẬT
        // ========================================================
        if (data.weapon) {
            data.weapon.recoil = 0.0; 
            data.weapon.recoil_multiplier = 0.0;
            data.weapon.camera_shake = 0.0; 
            data.weapon.aim_acceleration = 0.0;
            data.weapon.spread = 0.0;
        }
        if (data.gameState) {
            data.gameState.weaponRecoil = 0.0; 
            data.gameState.cameraShake = 0.0;
            data.gameState.shakeIntensity = 0.0;
        }

        const players = data.players || data.targets || [];
        if (players.length === 0) return data;
        
        // Tìm mục tiêu gần nhất
        players.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const target = players[0];
        if (!target.position && !target.headHitbox) return data;

        const tPos = target.headHitbox || target.position;
        const tVel = target.velocity || {x:0, y:0, z:0};
        const tAcc = target.acceleration || {x:0, y:0, z:0}; 
        const sPos = data.playerPosition || {x:0, y:0, z:0};
        const sVel = data.playerVelocity || {x:0, y:0, z:0}; 

        // Xóa sổ khối thân dưới của kẻ địch
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
        
        // ========================================================
        // II. DYNAMIC DELTA CLAMPING & COUNTER-FORCE (Khắc phục vượt đầu)
        // ========================================================
        if (data.input_state && data.input_state.isFiring) {
            let currentAimY = data.currentAimPosition ? data.currentAimPosition.y : sPos.y;
            let currentAimX = data.currentAimPosition ? data.currentAimPosition.x : sPos.x;
            
            let userDragY = data.input_state.deltaY || 0; 
            
            // Tính khoảng cách chính xác còn lại để chạm đến trán
            let distanceToHead = targetHeadY - currentAimY;

            if (distanceToHead > 0.01) { 
                // TRẠNG THÁI 1: TÂM ĐANG Ở DƯỚI ĐẦU (Đang bị kẹt ở ngực/cổ)
                
                // Bơm lực đối kháng tự động ngay cả khi không vuốt (chống game ghì tâm xuống)
                let appliedForceY = Math.max(userDragY * this.config.dragBoostFactor, this.config.counterGravityForce);

                // THUẬT TOÁN KẸP (CLAMP): Đảm bảo lực đẩy lên không bao giờ vượt qua khoảng cách còn lại
                data.input_state.deltaY = Math.min(appliedForceY, distanceToHead);

                // Gom tâm trục ngang (Phễu từ tính)
                let distanceToTargetX = targetHeadX - currentAimX;
                data.input_state.deltaX = distanceToTargetX * this.config.horizontalFunnel; 

                // Tính toán vị trí nội suy thực tế sau khi kẹp
                finalAimY = currentAimY + data.input_state.deltaY;
                
            } else if (distanceToHead < -0.01) {
                // TRẠNG THÁI 2: TÂM BAY QUÁ ĐẦU (Rất hiếm khi xảy ra nhờ Clamp)
                // Ép cứng lực vuốt lên về 0 để tâm không bay thêm, hút ngược về trán
                if (data.input_state.deltaY > 0) data.input_state.deltaY = 0;
                finalAimY = targetHeadY;
                data.input_state.deltaX = 0;

            } else {
                // TRẠNG THÁI 3: KHÓA CHẾT TẠI ĐIỂM VÀNG (Perfect Lock)
                // Cắt đứt hoàn toàn Input tay, giữ tĩnh trên sọ
                data.input_state.deltaY = 0; 
                data.input_state.deltaX = 0; 
                data.input_state.pitch = 0;
                data.input_state.yaw = 0;
                finalAimY = targetHeadY;
                finalAimX = targetHeadX;
                finalAimZ = interceptPoint[2];
            }
        }

        // ========================================================
        // III. XUẤT GÓI TIN ĐÃ GHI ĐÈ 
        // ========================================================
        const finalAimPosition = { x: finalAimX, y: finalAimY, z: finalAimZ };

        data.aimPosition = finalAimPosition;
        data.camera_state = {
            forced_target: finalAimPosition,
            lock_bone: "bone_Head",
            stickiness: 1.0,           
            tracking_mode: "ABSOLUTE", 
            interpolation: "ZERO"      
        };

        data.isHeadshot = true;
        data.forceHit = true;
        data.hitLocation = "head";
        
        return data;
    }
}

// ==========================================
// EXECUTOR
// ==========================================
const SystemCore = new ApexController();

if (typeof $response !== "undefined" && $response.body) {
    try {
        const payload = JSON.parse($response.body);
        $done({ body: JSON.stringify(SystemCore.processFrame(payload)) });
    } catch (e) {
        $done({ body: $response.body });
    }
}
