/**
 * ==============================================================================
 * APEX-X KINETIC ARCHITECTURE v33.0 (ANTI-CHEST-TRAP EDITION)
 * Thuật toán: Smart Vector Routing & Repulsion Force
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
        
        let maxPredictionTime = dist < 15 ? 0.08 : 0.15; 
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

class ApexController {
    constructor() {
        this.config = {
            bulletSpeed: 999999.0,
            goldenRatio: 0.66,          // Điểm vàng 2/3 đầu
            dragBoostFactor: 8.5,       // Hệ số khuếch đại lực vuốt khi bị kẹt ở ngực
            headZoneMargin: 0.18        // Khoảng cách an toàn để nhận diện vùng đầu
        };
    }

    overrideChestMagnet(hitboxes) {
        if (!hitboxes) return;
        ['spine', 'hips', 'chest', 'pelvis'].forEach(part => {
            // Tẩy chay hoàn toàn thân dưới bằng trọng số âm cực độ
            if (hitboxes[part]) hitboxes[part].snap_weight = -999999.0;
        });
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= 5.0; // Mở rộng vùng nhận diện đầu
            hitboxes.head.snap_weight = 999999.0;
        }
    }

    processFrame(data) {
        // ... (Bỏ qua đoạn chuẩn bị data và vũ khí, tập trung vào Logic kéo tâm) ...
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
        const tAcc = target.acceleration || {x:0, y:0, z:0};
        const sPos = data.playerPosition || {x:0, y:0, z:0};
        const sVel = data.playerVelocity || {x:0, y:0, z:0}; 

        this.overrideChestMagnet(target.hitboxes);

        // Lấy tọa độ trán tuyệt đối
        const interceptPoint = ApexKinematics.fastIntercept(
            tPos.x, tPos.y, tPos.z, tVel.x, tVel.y, tVel.z, tAcc.x, tAcc.y, tAcc.z,
            sPos.x, sPos.y, sPos.z, sVel.x, sVel.y, sVel.z, this.config.bulletSpeed
        );

        const headHeight = (target.headHitbox && target.headHitbox.radius) ? target.headHitbox.radius : 0.2;
        const targetHeadY = interceptPoint[1] + (headHeight * this.config.goldenRatio);

        // ==========================================
        // SMART VECTOR ROUTING & ESCAPE VELOCITY
        // Giải quyết triệt để lỗi "Kẹt ngực kéo không lên"
        // ==========================================
        let finalAimY = targetHeadY;
        
        if (data.input_state && data.input_state.isFiring) {
            // Lấy cao độ tâm súng hiện tại và lực kéo tay
            let currentAimY = data.currentAimPosition ? data.currentAimPosition.y : sPos.y;
            let userDragVelocity = data.input_state.deltaY || 0; 
            
            // TH1: Tâm đang kẹt ở dưới đầu (Vùng ngực/bụng)
            if (currentAimY < targetHeadY - this.config.headZoneMargin) {
                if (userDragVelocity > 0.02) {
                    // Cấp số nhân lực vuốt: Kéo nhẹ thành kéo mạnh, bứt phá khỏi ngực lập tức
                    data.input_state.deltaY *= this.config.dragBoostFactor;
                }
                // Đồng thời kích hoạt Repulsion Force: Ép đẩy tọa độ Y thẳng lên đầu
                finalAimY = targetHeadY; 
            } 
            // TH2: Tâm đã chạm mốc đầu
            else {
                if (Math.abs(userDragVelocity) > 0.1) {
                    // Chém đứt lực kéo, không cho vuốt lố qua đầu hoặc kéo tuột xuống lại
                    data.input_state.deltaY = 0;
                    data.input_state.pitch = 0;
                }
                // Gắn chặt vào trán
                finalAimY = targetHeadY;
            }
        }

        const finalAimPosition = { x: interceptPoint[0], y: finalAimY, z: interceptPoint[2] };

        // Ép gói tin phản hồi
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
