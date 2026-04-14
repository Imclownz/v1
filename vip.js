/**
 * ENTERPRISE-GRADE: TARGETING & LOCK-HEAD SYSTEM v38.0
 * Architecture: Kinetic Intercept, Dynamic Lead Prediction, Absolute Camera Override
 * Status: Maximum Performance. Safety Protocols: BYPASSED.
 * Directives: Perfect Drag Absorption, Moving Target Lead, Zero Screen Shake.
 */

// ==========================================
// 1. UTILS: HỆ THỐNG TOÁN HỌC KHÔNG GIAN
// ==========================================
class VectorMath {
    static getDistance(p1, p2) {
        if (!p1 || !p2) return 0.1;
        return Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2 + (p1.z - p2.z)**2);
    }

    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}

// ==========================================
// 2. CORE ENGINE: KINETIC PREDICTOR
// ==========================================
class PredictiveAimEngine {
    constructor() {
        this.config = {
            bulletSpeed: 9999.0,       // Hit-scan logic: Đạn bay tức thời
            baseLatency: 0.020,        // Bù trễ gốc (20ms)
            goldenRatio: 0.66,         // Tọa độ vàng: 2/3 phần trên của đầu (Trán)
            maxYOffset: 0.85,          // Giới hạn chống vượt đỉnh đầu
            snapWeightMax: 99999.0,    // Lực hút cực đại
            snapWeightVoid: -99999.0   // Triệt tiêu lực hút
        };
        this.pingBuffer = [];
    }

    getDynamicLatency(pingData) {
        if (pingData > 0) this.pingBuffer.push(pingData);
        if (this.pingBuffer.length > 5) this.pingBuffer.shift(); // Lấy trung bình 5 frame gần nhất
        
        if (this.pingBuffer.length === 0) return this.config.baseLatency;
        const avgPingMs = this.pingBuffer.reduce((a, b) => a + b, 0) / this.pingBuffer.length;
        return avgPingMs / 1000.0; // Đổi sang giây
    }

    enforceZeroRecoil(weaponConfig) {
        if (!weaponConfig) return;
        // Loại bỏ hoàn toàn các yếu tố gây lệch tâm và rung giật
        weaponConfig.recoil = 0.0;
        weaponConfig.camera_shake = 0.0;
        weaponConfig.spread = 0.0;
        weaponConfig.bullet_drop = 0.0; 
        weaponConfig.aim_acceleration = 0.0; 
    }

    breakChestLock(hitboxes) {
        if (!hitboxes) return;
        
        // Triệt tiêu toàn bộ lực kéo vào thân dưới
        const voidBones = ['spine', 'spine1', 'spine2', 'chest', 'pelvis', 'hips'];
        for (let i = 0; i < voidBones.length; i++) {
            if (hitboxes[voidBones[i]]) {
                hitboxes[voidBones[i]].snap_weight = this.config.snapWeightVoid;
                hitboxes[voidBones[i]].priority = "IGNORE";
            }
        }
        
        // Cường hóa vùng đầu
        if (hitboxes.head) {
            hitboxes.head.priority = "MAXIMUM";
            hitboxes.head.snap_weight = this.config.snapWeightMax;
            hitboxes.head.m_Radius *= 5.0; // Tăng diện tích bắt tâm
        }
    }

    /**
     * THUẬT TOÁN CỐT LÕI: Dự đoán và Chặn đầu mục tiêu di chuyển
     */
    calculatePredictiveLockPoint(target, selfVelocity, latencyInSeconds) {
        const hPos = target.head_pos;
        const tVel = target.velocity || { x: 0, y: 0, z: 0 };
        const distance = target.distance || 10.0;
        
        // 1. Tính toán thời gian đạn chạm mục tiêu (Time To Hit)
        const timeToHit = (distance / this.config.bulletSpeed) + latencyInSeconds;
        
        // 2. Dự đoán trục X, Z (Đón đầu hướng chạy của kẻ địch)
        // Lấy vận tốc địch trừ vận tốc bản thân để ra vận tốc tương đối
        const interceptX = hPos.x + ((tVel.x - selfVelocity.x) * timeToHit);
        const interceptZ = hPos.z + ((tVel.z - selfVelocity.z) * timeToHit);
        
        // 3. Xử lý trục Y (Tối ưu hóa thao tác Drag/Kéo tâm)
        const headHeight = target.hitboxes?.head?.m_Height || 0.2;
        
        // Vị trí trán mục tiêu (Golden Ratio)
        const targetGoldenY = hPos.y + (headHeight * this.config.goldenRatio);
        
        // Dự đoán trục Y nếu địch nhảy lên hoặc rơi xuống
        const predictedY = hPos.y + ((tVel.y - selfVelocity.y) * timeToHit);
        
        // CHỐNG VƯỢT ĐẦU: Ép khung giới hạn cho trục Y
        const absoluteMaxY = hPos.y + (headHeight * this.config.maxYOffset);
        
        let finalInterceptY = predictedY;
        
        // Nếu dự đoán Y thấp hơn Golden Ratio (do địch đang rơi), kéo nó lên trán.
        // Nếu dự đoán Y cao hơn đỉnh đầu (do vẩy tâm quá tay hoặc địch nhảy), ép nó xuống nắp đầu.
        if (finalInterceptY < targetGoldenY) finalInterceptY = targetGoldenY;
        if (finalInterceptY > absoluteMaxY) finalInterceptY = absoluteMaxY;

        return { x: interceptX, y: finalInterceptY, z: interceptZ };
    }

    processFrame(payloadData) {
        if (!payloadData || typeof payloadData !== 'object') return payloadData;
        if (!payloadData.players || !Array.isArray(payloadData.players)) return payloadData;

        // 1. Thiết lập lại cấu hình vũ khí (Zero Recoil)
        if (payloadData.weapon) this.enforceZeroRecoil(payloadData.weapon);

        const latencySecs = this.getDynamicLatency(payloadData.ping);
        const selfVel = payloadData.player_velocity || { x: 0, y: 0, z: 0 };
        
        if (payloadData.players.length > 0) {
            // Lọc và lấy mục tiêu gần nhất
            payloadData.players.sort((a, b) => (a.distance || 999) - (b.distance || 999));
            const target = payloadData.players[0];

            if (target.head_pos) {
                // 2. Vô hiệu hóa lực từ tính ở ngực
                this.breakChestLock(target.hitboxes);

                // 3. Tính toán tọa độ ngắm bắn đón đầu (Lead Prediction)
                const lockPoint = this.calculatePredictiveLockPoint(target, selfVel, latencySecs);

                // 4. Ghi đè trạng thái Camera: Khóa cứng, loại bỏ rung giật
                payloadData.camera_state = {
                    forced_target: lockPoint,
                    lock_bone: "bone_Head",
                    stickiness: 1.0,        // Khóa tuyệt đối 100%
                    interpolation: "ZERO"   // Tắt hoàn toàn thuật toán làm mượt mặc định của game
                };
            }
        }

        return payloadData;
    }
}

// ==========================================
// 3. INTERCEPTOR BINDING (Shadowrocket)
// ==========================================
const EngineInstance = new PredictiveAimEngine();

function interceptAndMutate(bodyString) {
    try {
        const payload = JSON.parse(bodyString);
        const processedPayload = EngineInstance.processFrame(payload);
        return JSON.stringify(processedPayload);
    } catch (e) {
        return bodyString; // Fallback an toàn
    }
}

// Thực thi
if (typeof $response !== "undefined" && $response.body) {
    $done({ body: interceptAndMutate($response.body) });
}
