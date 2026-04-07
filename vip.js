/**
 * ==============================================================================
 * APEX-X KINETIC ARCHITECTURE v34.0 (ABSOLUTE TRACKING EDITION)
 * Thuật toán: Magnetic Funneling & Synchronized Tracking Lock
 * ==============================================================================
 */

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
        
        // CQC: Dự đoán cực ngắn để bám sát chuyển động lách/nhảy
        let maxPredictionTime = dist < 15 ? 0.05 : 0.12; 
        let t = Math.min(dist / vBullet, maxPredictionTime);

        let t2, fx, fy, fz;
        for (let i = 0; i < KINETIC_ITERATIONS; i = i + 1) {
            t2 = t * t;
            // Áp dụng gia tốc (Gravity bù trừ khi địch nhảy)
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

class ApexController {
    constructor() {
        this.config = {
            bulletSpeed: 999999.0,
            goldenRatio: 0.66,
            dragBoostFactor: 8.5,       
            headZoneMargin: 0.18,       
            horizontalFunnel: 0.85      // 85% Lực gom trục ngang khi địch lách
        };
    }

    overrideChestMagnet(hitboxes) {
        if (!hitboxes) return;
        ['spine', 'hips', 'chest', 'pelvis'].forEach(part => {
            if (hitboxes[part]) hitboxes[part].snap_weight = -999999.0;
        });
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= 5.0; 
            hitboxes.head.snap_weight = 999999.0;
        }
    }

    processFrame(data) {
        if (data.weapon) {
            data.weapon.recoil = 0; data.weapon.camera_shake = 0; data.weapon.aim_acceleration = 0;
        }

        const players = data.players || data.targets || [];
        if (players.length === 0) return data;
        players.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const target = players[0];

        if (!target.position && !target.headHitbox) return data;

        const tPos = target.headHitbox || target.position;
        const tVel = target.velocity || {x:0, y:0, z:0};
        const tAcc = target.acceleration || {x:0, y:0, z:0}; // Chứa gia tốc trọng trường khi nhảy
        const sPos = data.playerPosition || {x:0, y:0, z:0};
        const sVel = data.playerVelocity || {x:0, y:0, z:0}; 

        this.overrideChestMagnet(target.hitboxes);

        // Lấy tọa độ trán tuyệt đối (Đã tính toán bù trừ nhảy và lách)
        const interceptPoint = ApexKinematics.fastIntercept(
            tPos.x, tPos.y, tPos.z, tVel.x, tVel.y, tVel.z, tAcc.x, tAcc.y, tAcc.z,
            sPos.x, sPos.y, sPos.z, sVel.x, sVel.y, sVel.z, this.config.bulletSpeed
        );

        const headHeight = (target.headHitbox && target.headHitbox.radius) ? target.headHitbox.radius : 0.2;
        const targetHeadY = interceptPoint[1] + (headHeight * this.config.goldenRatio);

        // Tọa độ mục tiêu tương lai (X, Y, Z)
        const targetHeadX = interceptPoint[0];
        const targetHeadZ = interceptPoint[2];

        // ==========================================
        // MAGNETIC FUNNEL & ABSOLUTE TRACKING
        // Quản lý trạng thái khóa mục tiêu
        // ==========================================
        let finalAimY = targetHeadY;
        let finalAimX = targetHeadX;
        let finalAimZ = targetHeadZ;
        
        if (data.input_state && data.input_state.isFiring) {
            let currentAimY = data.currentAimPosition ? data.currentAimPosition.y : sPos.y;
            let currentAimX = data.currentAimPosition ? data.currentAimPosition.x : sPos.x;
            
            let userDragY = data.input_state.deltaY || 0; 
            let userDragX = data.input_state.deltaX || 0;

            // ----------------------------------------------------
            // PHASE 1: ACQUISITION (Gom tâm từ ngực lên đầu)
            // ----------------------------------------------------
            if (currentAimY < targetHeadY - this.config.headZoneMargin) {
                // Đang bị kẹt ở dưới ngực
                if (userDragY > 0.02) {
                    // Xé toạc lực hút ngực, đẩy mạnh lên trên
                    data.input_state.deltaY *= this.config.dragBoostFactor;
                    
                    // MAGNETIC FUNNEL: Ép trục X (Ngang) chạy theo mục tiêu
                    // Dù địch lách sang phải hay trái, trục X tự động bị nắn cong vào đầu
                    let distanceToTargetX = targetHeadX - currentAimX;
                    data.input_state.deltaX = distanceToTargetX * this.config.horizontalFunnel; 
                }
                finalAimY = targetHeadY; 
            } 
            // ----------------------------------------------------
            // PHASE 2: ABSOLUTE TRACKING LOCK (Khóa bám dính)
            // ----------------------------------------------------
            else {
                // Tâm đã chạm đầu -> Kích hoạt khóa chết
                // TƯỚC QUYỀN ĐIỀU KHIỂN CỦA TAY
                data.input_state.deltaY = 0; // Không cho vuốt vượt đầu
                data.input_state.deltaX = 0; // Không cho trượt ngang ra ngoài

                // Camera liên tục bị ép đồng bộ với vector Di chuyển/Nhảy của kẻ địch
                finalAimY = targetHeadY;
                finalAimX = targetHeadX;
                finalAimZ = targetHeadZ;
            }
        }

        const finalAimPosition = { x: finalAimX, y: finalAimY, z: finalAimZ };

        // Ép dữ liệu đầu ra: Camera sẽ bám dính không rời
        data.aimPosition = finalAimPosition;
        data.camera_state = {
            forced_target: finalAimPosition,
            lock_bone: "bone_Head",
            stickiness: 1.0,           // Stickiness tối đa
            tracking_mode: "ABSOLUTE", // Gắn cờ khóa tuyệt đối cho Engine xử lý
            interpolation: "ZERO"      
        };

        data.isHeadshot = true;
        data.forceHit = true;
        data.hitLocation = "head";
        
        return data;
    }
}
