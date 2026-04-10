/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v31.0
 * Architecture: Modular, Neural-Kinetic Prediction, Zero-Recoil Enforcement
 */

// ==========================================
// 1. UTILS & MATH (Hỗ trợ tính toán nhanh)
// ==========================================
class VectorMath {
    static calculateDistance(p1, p2) {
        return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
    }
}

// ==========================================
// 2. ECOSYSTEM: VALIDATOR & LOGGER
// ==========================================
class SystemValidator {
    /**
     * Input Sanitization: Lọc dữ liệu rác, đảm bảo payload an toàn
     */
    static sanitizePayload(data) {
        if (!data || typeof data !== 'object') return null;
        if (!data.players || !Array.isArray(data.players)) data.players = [];
        return data;
    }
}

class PerformanceLogger {
    static log(action, latency) {
        // Trong môi trường production, chỉ log các spike latency để tránh giật lag
        if (latency > 50) {
            console.warn(`[WARN] T-Spike detected: ${latency}ms during ${action}`);
        }
    }
}

// ==========================================
// 3. CORE LOGIC: KINETIC INTERCEPT ENGINE
// ==========================================
class KineticEngine {
    constructor() {
        // Đặt các thông số ở mức tối đa, bỏ qua quy tắc an toàn
        this.config = {
            bulletSpeed: 9999.0, // Vận tốc cực đại, hit-scan
            networkLatency: 0.015, // Bù trễ siêu thấp
            headHitboxMultiplier: 5.0, // Phóng to hitbox đầu x5
            goldenRatio: 0.66, // Khóa vào 2/3 phần trên của đầu (trán)
        };
        this.activeTargetId = null;
    }

    /**
     * Triệt tiêu hoàn toàn độ giật và áp dụng đồng nhất cho mọi vũ khí
     */
    enforceZeroRecoil(weaponConfig) {
        if (!weaponConfig) return;
        weaponConfig.recoil = 0.0;
        weaponConfig.camera_shake = 0.0;
        weaponConfig.spread = 0.0;
        weaponConfig.bullet_drop = 0.0; // Triệt tiêu trọng lực đạn
        weaponConfig.wind_resistance = 0.0; // Triệt tiêu gió
        weaponConfig.aim_acceleration = 0.0;
    }

    /**
     * Xóa bỏ lực hút vào thân dưới, ép mục tiêu thành vùng đầu
     */
    breakChestLock(hitboxes) {
        if (!hitboxes) return;
        // Đánh sập priority của các vùng thân dưới
        if (hitboxes.spine) hitboxes.spine.snap_weight = -99999.0;
        if (hitboxes.hips) hitboxes.hips.snap_weight = -99999.0;
        if (hitboxes.chest) hitboxes.chest.snap_weight = -99999.0;
        
        // Cường hóa vùng đầu và cổ
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= this.config.headHitboxMultiplier;
        }
        if (hitboxes.neck) hitboxes.neck.priority = "HEAD";
    }

    /**
     * Thuật toán chặn đầu (Intercept)
     */
    calculateLockPoint(target, selfVelocity) {
        const tVel = target.velocity || { x: 0, y: 0, z: 0 };
        const hPos = target.head_pos;
        
        // Môi trường không trọng lực, quỹ đạo là vector thẳng
        const timeToHit = (target.distance / this.config.bulletSpeed) + this.config.networkLatency;
        
        const interceptX = hPos.x + ((tVel.x - selfVelocity.x) * timeToHit);
        const interceptZ = hPos.z + ((tVel.z - selfVelocity.z) * timeToHit);
        
        // Chống vượt quá đầu: Tính toán tọa độ Y chính xác tại trán (2/3 đầu)
        const headHeight = target.hitboxes?.head?.m_Height || 0.2;
        const interceptY = hPos.y + (headHeight * this.config.goldenRatio);

        return { x: interceptX, y: interceptY, z: interceptZ };
    }

    processFrame(payloadData) {
        const startTime = Date.now();
        const data = SystemValidator.sanitizePayload(payloadData);
        if (!data) return payloadData; // Trả về nguyên bản nếu lỗi

        // 1. Chuẩn hóa vũ khí (Universal Rules)
        if (data.weapon) this.enforceZeroRecoil(data.weapon);

        // 2. Xử lý Logic Bắt mục tiêu
        const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
        
        if (data.players.length > 0) {
            // Sắp xếp lấy mục tiêu gần nhất
            data.players.sort((a, b) => a.distance - b.distance);
            const target = data.players[0];
            this.activeTargetId = target.id;

            this.breakChestLock(target.hitboxes);

            const lockPoint = this.calculateLockPoint(target, selfVel);

            // Ghi đè trạng thái camera (Không Auto-shoot, Không Wallhack)
            data.camera_state = {
                forced_target: lockPoint,
                lock_bone: "bone_Head",
                stickiness: 1.0, // Khóa cứng tuyệt đối
                interpolation: "ZERO" // Loại bỏ làm mượt
            };
        }

        // 3. Format Đầu ra
        PerformanceLogger.log('FrameProcessing', Date.now() - startTime);
        return data;
    }
}

// ==========================================
// 4. BỘ ĐIỀU PHỐI (ENTRY POINT)
// ==========================================
const EngineInstance = new KineticEngine();

function interceptAndProcessPacket(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const processedPayload = EngineInstance.processFrame(payload);
        return JSON.stringify(processedPayload);
    } catch (e) {
        return bodyString; // Fallback an toàn, không làm crash game
    }
}

// Thực thi (Tích hợp vào môi trường Shadowrocket / Proxy)
if (typeof $response !== "undefined" && $response.body) {
    $done({ body: interceptAndProcessPacket($response.body) });
}
