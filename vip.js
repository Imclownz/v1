/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v37.2
 * Architecture: Kinetic Intercept Engine (Base Restored)
 * Optimization: SMG/AR Continuous Fire (Zero-Bloom, Anti-Accumulation)
 * Status: Maximum Performance. Safety Protocols: BYPASSED.
 */

// ==========================================
// 1. UTILS & MATH (Xử lý Vector & Không gian 3D)
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
    static sanitizePayload(data) {
        if (!data || typeof data !== 'object') return null;
        if (!data.players || !Array.isArray(data.players)) data.players = [];
        return data;
    }
}

class PerformanceLogger {
    static log(action, latency) {
        if (latency > 50) {
            console.warn(`[WARN] T-Spike detected: ${latency}ms during ${action}.`);
        }
    }
}

// ==========================================
// 3. CORE LOGIC: KINETIC INTERCEPT ENGINE V37.2
// ==========================================
class KineticEngine {
    constructor() {
        this.config = {
            bulletSpeed: 9999.0, // Hit-scan logic
            baseNetworkLatency: 0.015,
            headHitboxMultiplier: 5.0, 
            goldenRatio: 0.66, // Khóa 2/3 đầu (Trán)
            maxYOffset: 0.85 // Giới hạn trục Y (Chống vẩy lên trời)
        };
        this.activeTargetId = null;
        this.latencyBuffer = []; 
    }

    getDynamicLatency(currentPing) {
        if (currentPing) {
            this.latencyBuffer.push(currentPing);
            if (this.latencyBuffer.length > 5) this.latencyBuffer.shift();
        }
        if (this.latencyBuffer.length === 0) return this.config.baseNetworkLatency;
        
        const avgPing = this.latencyBuffer.reduce((a, b) => a + b, 0) / this.latencyBuffer.length;
        return avgPing / 1000; 
    }

    /**
     * THE IRONCLAD LAW 1: Tối ưu hóa tuyệt đối cho SMG & AR
     * Triệt tiêu Base Recoil VÀ các chỉ số cộng dồn khi xả đạn liên tục
     */
    enforceZeroRecoil(weaponConfig) {
        if (!weaponConfig) return;
        
        // 1. Thông số tĩnh (Logic gốc)
        weaponConfig.recoil = 0.0;
        weaponConfig.camera_shake = 0.0;
        weaponConfig.spread = 0.0;
        weaponConfig.bullet_drop = 0.0; 
        weaponConfig.wind_resistance = 0.0; 
        weaponConfig.aim_acceleration = 0.0;

        // 2. Thông số động - SMG/AR Fix (Triệt tiêu độ lệch đạn liên thanh)
        weaponConfig.progressive_spread = 0.0;    // Xóa độ nở tâm theo thời gian
        weaponConfig.recoil_multiplier = 0.0;     // Xóa hệ số nhân giật
        weaponConfig.max_spread = 0.0;            // Khóa cứng giới hạn lan tỏa
        weaponConfig.horizontal_recoil = 0.0;     // Triệt tiêu văng đạn ngang (đặc trưng tiểu liên)
        weaponConfig.vertical_recoil = 0.0;       // Triệt tiêu nảy súng dọc
        weaponConfig.recoil_accumulation = 0.0;   // Xóa cộng dồn giật
        weaponConfig.bloom = 0.0;                 // Xóa Bloom
    }

    /**
     * THE IRONCLAD LAW 2 & 3: Anti-Chest Lock & Absolute Head Priority
     */
    breakChestLock(hitboxes) {
        if (!hitboxes) return;
        const voidWeight = -99999.0;
        
        // Phá hủy trọng số thân dưới
        if (hitboxes.spine) hitboxes.spine.snap_weight = voidWeight;
        if (hitboxes.hips) hitboxes.hips.snap_weight = voidWeight;
        if (hitboxes.chest) hitboxes.chest.snap_weight = voidWeight;
        if (hitboxes.pelvis) hitboxes.pelvis.snap_weight = voidWeight;
        
        // Bơm lực từ tính cực đại vào vùng Đầu
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.m_Radius *= this.config.headHitboxMultiplier;
            hitboxes.head.snap_weight = 99999.0; 
        }
        if (hitboxes.neck) hitboxes.neck.priority = "HEAD";
    }

    /**
     * Thuật toán chặn đầu & Y-Axis Clamping
     */
    calculateLockPoint(target, selfVelocity, dynamicLatency) {
        const tVel = target.velocity || { x: 0, y: 0, z: 0 };
        const hPos = target.head_pos;
        
        const distance = target.distance || VectorMath.calculateDistance(hPos, {x:0, y:0, z:0});
        const timeToHit = (distance / this.config.bulletSpeed) + dynamicLatency;
        
        const interceptX = hPos.x + ((tVel.x - selfVelocity.x) * timeToHit);
        const interceptZ = hPos.z + ((tVel.z - selfVelocity.z) * timeToHit);
        
        const headHeight = target.hitboxes?.head?.m_Height || 0.2;
        const targetGoldenY = hPos.y + (headHeight * this.config.goldenRatio);
        const predictedY = hPos.y + ((tVel.y - selfVelocity.y) * timeToHit);
        const absoluteMaxY = hPos.y + (headHeight * this.config.maxYOffset);
        
        let finalInterceptY = predictedY;
        
        // Ép giới hạn: Không vọt qua đầu, không rơi xuống cổ
        if (finalInterceptY < targetGoldenY) finalInterceptY = targetGoldenY;
        if (finalInterceptY > absoluteMaxY) finalInterceptY = absoluteMaxY;

        return { x: interceptX, y: finalInterceptY, z: interceptZ };
    }

    processFrame(payloadData) {
        const startTime = Date.now();
        const data = SystemValidator.sanitizePayload(payloadData);
        if (!data) return payloadData; 

        const dynamicLatency = this.getDynamicLatency(data.ping);

        // Áp dụng Zero-Recoil toàn diện (Bao gồm SMG Fix)
        if (data.weapon) this.enforceZeroRecoil(data.weapon);

        const selfVel = data.player_velocity || { x: 0, y: 0, z: 0 };
        
        if (data.players.length > 0) {
            data.players.sort((a, b) => a.distance - b.distance);
            const target = data.players[0];
            this.activeTargetId = target.id;

            this.breakChestLock(target.hitboxes);

            const lockPoint = this.calculateLockPoint(target, selfVel, dynamicLatency);

            // Ghi đè trạng thái Camera: Stickiness 1.0 đảm bảo không bung tâm khi sấy
            data.camera_state = {
                forced_target: lockPoint,
                lock_bone: "bone_Head",
                stickiness: 1.0, 
                interpolation: "ZERO" 
            };
        }

        PerformanceLogger.log('FrameProcessing', Date.now() - startTime);
        return data;
    }
}

// ==========================================
// 4. ENTRY POINT (SHADOWROCKET INTEGRATION)
// ==========================================
const EngineInstance = new KineticEngine();

function interceptAndProcessPacket(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const processedPayload = EngineInstance.processFrame(payload);
        return JSON.stringify(processedPayload);
    } catch (e) {
        return bodyString; 
    }
}

if (typeof $response !== "undefined" && $response.body) {
    $done({ body: interceptAndProcessPacket($response.body) });
}
