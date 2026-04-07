// ==========================================
// KINETIC CORE v32.5: HIGH-SPEED CQC EDITION
// Bổ sung Relative Motion & EMA Filter
// ==========================================
const ResultBuffer = new Float64Array(3);
const KINETIC_ITERATIONS = 3;

class ApexKinematics {
    // Lưu trữ vận tốc cũ để lọc EMA
    static lastVx = 0; static lastVy = 0; static lastVz = 0;

    static fastIntercept(tx, ty, tz, tvx, tvy, tvz, ax, ay, az, sx, sy, sz, svx, svy, svz, vBullet) {
        // 1. Áp dụng EMA Filter để làm mượt chuyển hướng đột ngột (alpha = 0.65)
        const alpha = 0.65;
        let smoothVx = (tvx * alpha) + (this.lastVx * (1 - alpha));
        let smoothVy = (tvy * alpha) + (this.lastVy * (1 - alpha));
        let smoothVz = (tvz * alpha) + (this.lastVz * (1 - alpha));
        
        this.lastVx = smoothVx; this.lastVy = smoothVy; this.lastVz = smoothVz;

        // 2. Tính toán Vector Tương đối (Relative Velocity)
        let rVx = smoothVx - svx;
        let rVy = smoothVy - svy;
        let rVz = smoothVz - svz;

        // 3. Khởi tạo tính toán khoảng cách
        let dx = tx - sx;
        let dy = ty - sy;
        let dz = tz - sz;
        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // 4. Cắt giảm thời gian dự đoán nếu địch đảo hướng quá gắt (Chống Overshoot)
        let maxPredictionTime = dist < 15 ? 0.08 : 0.15; // CQC (<15m) dự đoán cực ngắn
        let t = Math.min(dist / vBullet, maxPredictionTime);

        let t2, fx, fy, fz;

        // Tối ưu hóa lặp Newton-Raphson
        for (let i = 0; i < KINETIC_ITERATIONS; i = i + 1) {
            t2 = t * t;
            
            fx = tx + rVx * t + 0.5 * ax * t2;
            fy = ty + rVy * t + 0.5 * ay * t2;
            fz = tz + rVz * t + 0.5 * az * t2;

            dx = fx - sx;
            dy = fy - sy;
            dz = fz - sz;
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
// CONTROLLER: DRAG CANCELLATION & INPUT ISOLATION
// ==========================================
class ApexController {
    constructor() {
        this.config = {
            bulletSpeed: 999999.0,
            goldenRatio: 0.66,
            maxHitboxExpansion: 8.5,
            chestLockPenalty: -99999.0,
            dragCancellationThreshold: 0.8 // Ngưỡng nhận diện lực kéo mạnh
        };
        this.lastAimY = 0;
    }

    enforceAbsoluteZeroRecoil(weaponConfig) {
        if (!weaponConfig) return;
        Object.assign(weaponConfig, {
            recoil: 0.0, recoil_multiplier: 0.0, camera_shake: 0.0,
            spread: 0.0, bullet_drop: 0.0, aim_acceleration: 0.0
        });
    }

    overrideChestMagnet(hitboxes) {
        if (!hitboxes) return;
        ['spine', 'hips', 'chest'].forEach(part => {
            if (hitboxes[part]) hitboxes[part].snap_weight = this.config.chestLockPenalty;
        });
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= this.config.maxHitboxExpansion;
            hitboxes.head.snap_weight = 999999.0;
        }
        if (hitboxes.neck) hitboxes.neck.priority = "HEAD";
    }

    processFrame(data) {
        if (data.weapon) this.enforceAbsoluteZeroRecoil(data.weapon);
        if (data.gameState) {
            data.gameState.weaponRecoil = 0;
            data.gameState.cameraShake = 0;
        }

        const players = data.players || data.targets || [];
        if (players.length === 0) return data;

        players.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const target = players[0];

        if (!target.position && !target.headHitbox) return data;

        // Lấy tọa độ và động lượng (Mặc định 0 nếu null)
        const tPos = target.headHitbox || target.position;
        const tVel = target.velocity || {x:0, y:0, z:0};
        const tAcc = target.acceleration || {x:0, y:0, z:0};
        const sPos = data.playerPosition || {x:0, y:0, z:0};
        const sVel = data.playerVelocity || {x:0, y:0, z:0}; // Vận tốc bản thân

        this.overrideChestMagnet(target.hitboxes);

        // Truyền cả vận tốc của kẻ địch và bản thân vào để tính toán Tương đối
        const interceptPoint = ApexKinematics.fastIntercept(
            tPos.x, tPos.y, tPos.z,
            tVel.x, tVel.y, tVel.z,
            tAcc.x, tAcc.y, tAcc.z,
            sPos.x, sPos.y, sPos.z,
            sVel.x, sVel.y, sVel.z,
            this.config.bulletSpeed
        );

        const headHeight = (target.headHitbox && target.headHitbox.radius) ? target.headHitbox.radius : 0.2;
        const targetY = interceptPoint[1] + (headHeight * this.config.goldenRatio);

        // ==========================================
        // DRAG CANCELLATION LOGIC (Triệt tiêu lực vuốt tay)
        // ==========================================
        let finalAimY = targetY;
        
        // Nếu user đang xả đạn (isFiring) và cố gắng kéo tâm cực mạnh (Input Swipe)
        if (data.input_state && data.input_state.isFiring) {
            let userDragVelocity = data.input_state.deltaY || 0; // Lực kéo trục dọc từ tay
            
            // Nếu lực vuốt tay vượt qua ngưỡng nhiễu, hệ thống sẽ bỏ qua Input này
            // và ép chết tọa độ Y vào vùng trán (Khóa dọc, thả ngang)
            if (Math.abs(userDragVelocity) > this.config.dragCancellationThreshold) {
                // Ép chết tọa độ Y vào điểm đã tính toán, không cho cộng thêm lực kéo tay
                data.input_state.deltaY = 0; 
                data.input_state.pitch = 0;
            }
        }

        const finalAimPosition = { x: interceptPoint[0], y: finalAimY, z: interceptPoint[2] };

        data.aimPosition = finalAimPosition;
        data.camera_state = {
            forced_target: finalAimPosition,
            lock_bone: "bone_Head",
            stickiness: 1.0,           
            interpolation: "ZERO"      
        };

        data.isHeadshot = true;
        data.forceHit = true;
        data.hitLocation = "head";
        
        return data;
    }
}
