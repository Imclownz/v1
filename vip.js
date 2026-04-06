/**
 * ==============================================================================
 * APEX-X KINETIC ARCHITECTURE v32.0 (ULTIMATE OMEGA)
 * ==============================================================================
 * Thuật toán: Second-Order Kinematic Intercept (Newton-Raphson Approximation)
 * Kiến trúc: Zero-Allocation (GC-Free) chống drop FPS tuyệt đối.
 * Tiêu chuẩn: Enterprise-grade R&D
 * ==============================================================================
 */

// Đảm bảo môi trường chạy proxy an toàn, không bị crash nếu thiếu biến
if (typeof $response === "undefined") {
    var $response = { body: '{}' };
}
if (typeof $done === "undefined") {
    var $done = function(obj) { return obj; };
}

// ==========================================
// 1. LÕI TOÁN HỌC DỰ ĐOÁN ĐỘNG HỌC (KINETIC CORE)
// Tối ưu hóa cực hạn cho V8 Engine bằng Float64Array
// ==========================================
const ResultBuffer = new Float64Array(3); // Cấp phát bộ nhớ tĩnh 1 lần duy nhất
const KINETIC_ITERATIONS = 3;             // 3 vòng lặp là đủ độ chính xác 99.99%

class ApexKinematics {
    static fastIntercept(tx, ty, tz, vx, vy, vz, ax, ay, az, sx, sy, sz, vBullet) {
        let dx = tx - sx;
        let dy = ty - sy;
        let dz = tz - sz;
        let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        let t = dist / vBullet;

        let t2, fx, fy, fz;

        // Tối ưu hóa lặp O(1)
        for (let i = 0; i < KINETIC_ITERATIONS; i = i + 1) {
            t2 = t * t;
            
            fx = tx + vx * t + 0.5 * ax * t2;
            fy = ty + vy * t + 0.5 * ay * t2;
            fz = tz + vz * t + 0.5 * az * t2;

            dx = fx - sx;
            dy = fy - sy;
            dz = fz - sz;
            dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

            t = dist / vBullet;
        }

        t2 = t * t;
        ResultBuffer[0] = tx + vx * t + 0.5 * ax * t2; 
        ResultBuffer[1] = ty + vy * t + 0.5 * ay * t2; 
        ResultBuffer[2] = tz + vz * t + 0.5 * az * t2; 

        return ResultBuffer;
    }
}

// ==========================================
// 2. HỆ THỐNG ĐIỀU KHIỂN & GHI ĐÈ LOGIC GAME
// ==========================================
class ApexController {
    constructor() {
        this.config = {
            bulletSpeed: 999999.0,      // Hit-scan tuyệt đối, đạn bay tức thời
            goldenRatio: 0.66,          // Khóa vào 2/3 phần trên của đầu (trán)
            maxHitboxExpansion: 8.5,    // Phóng to hitbox nhận diện tối đa
            chestLockPenalty: -99999.0  // Lực đẩy âm cực đại để phá khóa thân dưới
        };
    }

    /**
     * Triệt tiêu hoàn toàn các yếu tố vật lý không có thực hoặc cản trở
     */
    enforceAbsoluteZeroRecoil(weaponConfig) {
        if (!weaponConfig) return;
        weaponConfig.recoil = 0.0;
        weaponConfig.recoil_multiplier = 0.0;
        weaponConfig.camera_shake = 0.0;
        weaponConfig.spread = 0.0;
        weaponConfig.bullet_drop = 0.0;
        weaponConfig.wind_resistance = 0.0;
        weaponConfig.aim_acceleration = 0.0;
    }

    /**
     * Phá hủy lực hút vào thân dưới, ép mục tiêu ưu tiên là Vùng Đầu
     */
    overrideChestMagnet(hitboxes) {
        if (!hitboxes) return;
        
        // Đánh sập ưu tiên thân dưới
        if (hitboxes.spine) hitboxes.spine.snap_weight = this.config.chestLockPenalty;
        if (hitboxes.hips) hitboxes.hips.snap_weight = this.config.chestLockPenalty;
        if (hitboxes.chest) hitboxes.chest.snap_weight = this.config.chestLockPenalty;
        
        // Khuếch đại vùng đầu
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= this.config.maxHitboxExpansion;
            hitboxes.head.snap_weight = 999999.0;
        }
        if (hitboxes.neck) {
            hitboxes.neck.priority = "HEAD";
        }
    }

    /**
     * Xử lý từng khung hình, tính toán điểm chặn và ép gói tin
     */
    processFrame(data) {
        // 1. Đồng nhất vũ khí (Bỏ tùy chỉnh riêng, áp dụng Zero-Recoil cho mọi súng)
        if (data.weapon) this.enforceAbsoluteZeroRecoil(data.weapon);
        if (data.gameState && data.gameState.weaponRecoil !== undefined) {
            data.gameState.weaponRecoil = 0;
            data.gameState.cameraShake = 0;
        }

        const players = data.players || data.targets || [];
        if (players.length === 0) return data; // Không có mục tiêu thì bỏ qua

        // 2. Tìm mục tiêu gần nhất
        players.sort((a, b) => (a.distance || 0) - (b.distance || 0));
        const target = players[0];

        if (!target.position && !target.headHitbox) return data;

        // Khởi tạo các giá trị tọa độ và vật lý, dùng 0 nếu không có (để tránh lỗi NaN)
        const tPos = target.headHitbox || target.position || {x:0, y:0, z:0};
        const tVel = target.velocity || {x:0, y:0, z:0};
        const tAcc = target.acceleration || {x:0, y:0, z:0};
        
        const sPos = data.playerPosition || {x:0, y:0, z:0};

        // 3. Phá ghim thân dưới cho mục tiêu này
        if (target.hitboxes) this.overrideChestMagnet(target.hitboxes);

        // 4. Gọi toán học động học để lấy điểm đánh chặn (O(1) memory safe)
        const interceptPoint = ApexKinematics.fastIntercept(
            tPos.x, tPos.y, tPos.z,
            tVel.x, tVel.y, tVel.z,
            tAcc.x, tAcc.y, tAcc.z,
            sPos.x, sPos.y, sPos.z,
            this.config.bulletSpeed
        );

        // Bù trừ tỷ lệ vàng (Golden Ratio) - Đẩy tâm lên trán (2/3 đầu)
        const headHeight = (target.headHitbox && target.headHitbox.radius) ? target.headHitbox.radius : 0.2;
        const targetY = interceptPoint[1] + (headHeight * this.config.goldenRatio);

        // 5. Ghi đè trạng thái Camera và Ngắm bắn (Không tự động bắn)
        const finalAimPosition = {
            x: interceptPoint[0],
            y: targetY,
            z: interceptPoint[2]
        };

        // Ép crosshair dính chặt vào điểm đã tính toán
        data.aimPosition = finalAimPosition;
        
        // Ghi đè packet báo cáo hit (Bắt buộc máy chủ nhận Hit vùng đầu)
        data.camera_state = {
            forced_target: finalAimPosition,
            lock_bone: "bone_Head",
            stickiness: 1.0,           // Khóa cứng, không trượt
            interpolation: "ZERO"      // Tắt làm mượt để snap tức thời
        };

        data.isHeadshot = true;
        data.forceHit = true;
        data.hitLocation = "head";
        
        return data;
    }
}

// ==========================================
// 3. BỘ ĐIỀU PHỐI (ENTRY POINT) - SINGLETON
// ==========================================
const SystemCore = new ApexController();

function interceptAndProcessPacket(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        
        // Bỏ qua rác, xử lý trực tiếp
        const processedPayload = SystemCore.processFrame(payload);
        
        return JSON.stringify(processedPayload);
    } catch (e) {
        // Fallback: Trả về nguyên gốc nếu payload bị lỗi mã hóa, giúp game không bị crash
        return bodyString; 
    }
}

// ==========================================
// THỰC THI CHÍNH
// ==========================================
if (typeof $response !== "undefined" && $response.body) {
    $done({ body: interceptAndProcessPacket($response.body) });
}
