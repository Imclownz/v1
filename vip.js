/**
 * ==============================================================================
 * PROJECT: VORTEX-ASSIST V7.0 [MECHANICAL-ORGANIC SYNERGY]
 * Objective: 2D Screen-Center Culling, Vector Guidance, Delta-X Strafe Tracking,
 * Marksman Inverse-Braking, ADS 15px Pre-kick.
 * Environment: iOS Shortcuts / JSBridge
 * ==============================================================================
 */

const _vortex = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. VORTEX STATE V7.0 (BỘ NHỚ TOÀN CỤC)
// Đã mở rộng để hỗ trợ Ma trận 2D và Bám đuổi Trục X
// ============================================================================
if (!_vortex.__VortexState || _vortex.__VortexState.version !== "VORTEX_V7.0") {
    _vortex.__VortexState = {
        version: "VORTEX_V7.0",
        
        // Trạng thái Input (Ngón tay & Ống ngắm)
        input: { 
            rawX: 0, rawY: 0, 
            smoothX: 0, smoothY: 0,
            magnitude: 0, 
            isSwiping: false,
            dirX: 0, dirY: 0
        },

        // Trạng thái Vũ khí (Bổ sung MARKSMAN)
        weapon: { 
            type: "NONE", // Có thể là: SHOTGUN, SMG, AR, MARKSMAN, SNIPER
            isFiring: false, 
            bulletCount: 0,
            currentWeaponId: null
        },
        
        // Trạng thái Mục tiêu (Bổ sung 2D Distance & X-Axis Delta Tracking)
        target: { 
            id: null, 
            scanFrame: 0,
            distance3D: 999.0, 
            distance2D: 999.0,    // Khoảng cách Pixel trên màn hình (Tính từ Tâm chữ thập)
            pitchError: 999.0,    // Trục Y 3D
            yawError: 999.0,      // Trục X 3D
            enemyDeltaYaw: 0.0    // Vận tốc lướt ngang của địch trong 1 frame (Để Auto-Pull X)
        },

        // Động cơ Vật lý (Engine)
        engine: {
            isADS: false,          // Cờ nhận diện đang bật Scope
            thrustMultiplier: 1.0, 
            isABSBraking: false,
            remX: 0, remY: 0       // Bộ nhớ đệm Sub-pixel
        }
    };
}

// ============================================================================
// BƯỚC 1: INPUT INTERCEPTOR (Đọc lệnh ngón tay & Khử nhiễu)
// Nhiệm vụ: Đọc lực tay thô, làm mượt EMA, tính toán Vector Không Gian 2D.
// ============================================================================
class InputInterceptor {
    static execute(payload) {
        const inputState = _vortex.__VortexState.input;

        // 1. TRÍCH XUẤT LỰC VUỐT THÔ (RAW INPUT)
        let rawX = 0;
        let rawY = 0;

        if (payload.touch_delta) {
            rawX = payload.touch_delta.x || 0;
            rawY = payload.touch_delta.y || 0;
        } else if (payload.input_drag) {
            rawX = payload.input_drag.x || 0;
            rawY = payload.input_drag.y || 0;
        } else if (payload.mouse_delta) {
            rawX = payload.mouse_delta.x || 0;
            rawY = payload.mouse_delta.y || 0;
        }

        inputState.rawX = rawX;
        inputState.rawY = rawY;

        // 2. KỸ THUẬT LỌC NHIỄU "SUB-PIXEL EMA SMOOTHING"
        // Alpha = 0.45: Cân bằng hoàn hảo giữa độ mượt và phản hồi tức thời.
        const ALPHA = 0.45; 
        
        if (inputState.smoothX === undefined) inputState.smoothX = 0;
        if (inputState.smoothY === undefined) inputState.smoothY = 0;

        inputState.smoothX = (rawX * ALPHA) + (inputState.smoothX * (1.0 - ALPHA));
        inputState.smoothY = (rawY * ALPHA) + (inputState.smoothY * (1.0 - ALPHA));

        // 3. TOÁN HỌC VECTOR (TÍNH ĐỘ LỚN & HƯỚNG)
        let mag = Math.sqrt(inputState.smoothX ** 2 + inputState.smoothY ** 2);

        // 4. BỘ LỌC MICRO-DEADZONE (Chống trôi tâm khi tay run)
        if (mag < 1.0) {
            inputState.smoothX = 0;
            inputState.smoothY = 0;
            inputState.magnitude = 0;
            inputState.isSwiping = false;
            
            inputState.dirX = 0;
            inputState.dirY = 0;
        } else {
            inputState.magnitude = mag;
            inputState.isSwiping = true;
            
            // Tính toán Vector Hướng (Từ -1.0 đến 1.0) để Bước 3 bẻ cong quỹ đạo
            inputState.dirX = inputState.smoothX / mag;
            inputState.dirY = inputState.smoothY / mag;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 1.5: WEAPON ANALYZER (Phân loại súng & Đếm đạn)
// Nhiệm vụ: Tách biệt hoàn toàn súng nảy mạnh (MARKSMAN) khỏi AR/SMG/SG.
// ============================================================================
class WeaponAnalyzer {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;

        // ==========================================================
        // 1. PROGRESSIVE BULLET COUNTER (ĐẾM CHU KỲ XẢ ĐẠN)
        // ==========================================================
        let currentlyFiring = false;
        
        if (payload.is_firing !== undefined) {
            currentlyFiring = payload.is_firing;
        } else if (payload.weapon && payload.weapon.is_firing !== undefined) {
            currentlyFiring = payload.weapon.is_firing;
        }

        // Logic đếm số viên đạn đã bắn ra trong 1 lần đè cò
        if (currentlyFiring) {
            if (!weaponState.isFiring) {
                weaponState.bulletCount = 1; // Viên đầu tiên (Rất quan trọng cho Scope Kick)
            } else {
                weaponState.bulletCount += 1;
            }
        } else {
            weaponState.bulletCount = 0;
        }
        
        weaponState.isFiring = currentlyFiring;

        // ==========================================================
        // 2. ZERO-GC CLASSIFICATION (PHÂN LOẠI VŨ KHÍ)
        // ==========================================================
        if (payload.weapon) {
            const currentId = payload.weapon.id || "UNKNOWN";
            
            // Chỉ chạy thuật toán phân loại khi người chơi đổi súng (Tiết kiệm CPU)
            if (currentId !== weaponState.currentWeaponId) {
                weaponState.currentWeaponId = currentId;
                
                const identifier = `${currentId}_${payload.weapon.name || ""}_${payload.weapon.category || ""}`.toUpperCase();

                // [A]. NHÁNH MỚI: MARKSMAN (Súng gõ 1 viên, độ nảy nòng cực gắt)
                // Theo đúng yêu cầu: DE, Woodpecker, SKS, AC80, M590 (và các súng tương tự)
                if (identifier.includes("WOODPECKER") || identifier.includes("SKS") || 
                    identifier.includes("AC80") || identifier.includes("SVD") || 
                    identifier.includes("DESERT_EAGLE") || identifier.includes("DEAGLE") ||
                    identifier.includes("M590") || identifier.includes("M500") || 
                    identifier.includes("DRAGUNOV")) {
                    weaponState.type = "MARKSMAN";
                }
                // [B]. SHOTGUN (Hoa cải)
                else if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
                         identifier.includes("M1014") || identifier.includes("MAG-7") || 
                         identifier.includes("SPAS") || identifier.includes("TROGON") || 
                         identifier.includes("CHARGE")) {
                    weaponState.type = "SHOTGUN";
                } 
                // [C]. SMG (Tiểu liên sấy)
                else if (identifier.includes("SMG") || identifier.includes("MP40") || 
                         identifier.includes("UMP") || identifier.includes("MAC10") || 
                         identifier.includes("MP5") || identifier.includes("VECTOR") || 
                         identifier.includes("THOMPSON") || identifier.includes("P90") || 
                         identifier.includes("BIZON")) {
                    weaponState.type = "SMG";
                } 
                // [D]. SNIPER (Súng ngắm phát một)
                else if (identifier.includes("SNIPER") || identifier.includes("AWM") || 
                         identifier.includes("KAR98") || identifier.includes("M82B")) {
                    weaponState.type = "SNIPER"; 
                } 
                // [E]. AR (Súng trường sấy tự động)
                else if (identifier.includes("AR") || identifier.includes("RIFLE") || 
                         identifier.includes("AK") || identifier.includes("SCAR") || 
                         identifier.includes("M4A1") || identifier.includes("FAMAS") || 
                         identifier.includes("XM8") || identifier.includes("GROZA") || 
                         identifier.includes("AUG") || identifier.includes("PISTOL")) {
                    weaponState.type = "AR";
                } 
                else {
                    weaponState.type = "NONE";
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2: TARGET SCANNER 2D-3D (Mắt Thần Quét Đa Lớp V7.0)
// Công nghệ: Screen-Center 2D Culling, X-Axis Delta Tracking, Ultra-Magnetism.
// Nhiệm vụ: Tìm địch gần tâm chữ thập nhất, đo vận tốc lướt ngang của địch.
// ============================================================================
class TargetScanner2D3D {
    
    // Hàm chuẩn hóa góc quay (-180 đến 180 độ)
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static execute(payload) {
        const state = _vortex.__VortexState;
        
        if (!payload.players || !Array.isArray(payload.players)) return payload;

        let origin = payload.fire_origin || payload.anchorPos;
        if (!origin || (origin.x === 0 && origin.y === 0)) return payload;

        let currentYaw = payload.aim_yaw !== undefined ? payload.aim_yaw : (payload.camera ? payload.camera.yaw : 0.0);
        let currentPitch = payload.aim_pitch !== undefined ? payload.aim_pitch : (payload.camera ? payload.camera.pitch : 0.0);

        // ====================================================================
        // NHẬN DIỆN ỐNG NGẮM (ADS SENSOR)
        // ====================================================================
        let isADS = payload.is_ads || (payload.camera && payload.camera.fov && payload.camera.fov < 60.0);
        state.engine.isADS = isADS;

        if (!state.target.scanFrame) state.target.scanFrame = 0;
        state.target.scanFrame++;

        let previousTargetId = state.target.id;
        let previousEnemyYaw = state.target.lastEnemyYaw || 0.0; // Lưu góc cũ để tính vận tốc ngang

        let bestTarget = null;
        let lowest2DDistance = 999999.0; // Điểm số dựa trên mặt phẳng 2D Màn hình

        // ====================================================================
        // A. AGGRESSIVE CULLING & ULTRA-MAGNETISM (Lọc rác & Tăng từ tính Sọ)
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            let enemy = payload.players[i];
            
            // 1. Lọc tử sĩ & Đồng đội
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            if (enemy.is_teammate || (payload.my_team_id && enemy.team_id === payload.my_team_id)) continue;
            if (!enemy.hitboxes || (!enemy.hitboxes.head && !enemy.hitboxes.neck)) continue;

            let headPos = enemy.hitboxes.head ? enemy.hitboxes.head.pos : enemy.hitboxes.neck.pos;

            let dx = headPos.x - origin.x;
            let dy = headPos.y - origin.y;
            let dz = headPos.z - origin.z;
            let distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Bỏ qua địch quá xa (150m) để tiết kiệm RAM
            if (distance3D > 150.0) continue; 

            // Hủy diệt vật lý Tứ chi - Chỉ để lại Sọ
            const allBones = Object.keys(enemy.hitboxes);
            for (let b = 0; b < allBones.length; b++) {
                let boneName = allBones[b].toLowerCase();
                let bone = enemy.hitboxes[allBones[b]];

                if (boneName.includes('head') || boneName.includes('neck')) {
                    if (bone.radius) bone.radius = 0.5; // Kích thước đầu x2
                    bone.magnetism = 5.0;               // Từ tính x500%
                    bone.snap_weight = 99999.0;
                } else {
                    if (bone.radius !== undefined) bone.radius = 0.0001;
                    bone.magnetism = 0.0; bone.friction = 0.0; bone.snap_weight = -99999.0;
                    if (bone.pos && bone.pos.z) bone.pos.z -= 1.5;
                }
            }

            // ====================================================================
            // PHA 1 & 3: TÍNH TOÁN 3D EULER & CHIẾU LÊN MẶT PHẲNG 2D MÀN HÌNH
            // ====================================================================
            let distXZ = Math.sqrt(dx*dx + dz*dz) || 0.001;
            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);
            
            // Đây là Tọa độ 3D thực tế
            let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
            let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);

            // [LÕI 2D]: Dùng DeltaYaw và DeltaPitch làm Trục X và Y của Màn hình phẳng.
            // Biến fov2D chính là KHOẢNG CÁCH PIXEL từ Sọ địch đến Giao điểm Tâm Chữ Thập.
            let fov2D = Math.sqrt(rawDeltaYaw**2 + rawDeltaPitch**2);

            // Cắt rìa màn hình (Bật Scope thì chỉ lấy địch ở khu vực hẹp giữa màn)
            let baseCapsule = (distance3D < 3.0) ? 180.0 : ((120.0 / distance3D) + 12.0);
            let capsuleFovLimit = isADS ? (baseCapsule * 0.35) : baseCapsule; 
            
            let isStickyTarget = (enemy.id === previousTargetId);
            if (isStickyTarget) capsuleFovLimit *= 1.5; // Dính chặt mục tiêu cũ

            if (fov2D > capsuleFovLimit) continue;

            // Chấm điểm hoàn toàn dựa trên 2D (Địch càng gần Tâm chữ thập -> Điểm càng nhỏ)
            let stancePenalty = 1.0;
            let heightDiff = origin.y - headPos.y; 
            if (heightDiff > 0.8) stancePenalty *= 2.0; 
            if (enemy.is_behind_cover) stancePenalty *= 10.0;

            let stickyBonus = isStickyTarget ? 0.50 : 1.0;
            let score2D = fov2D * stancePenalty * stickyBonus;

            if (score2D < lowest2DDistance) {
                lowest2DDistance = score2D;

                // ====================================================================
                // PHA 2: THEO DÕI VẬN TỐC LƯỚT NGANG (STRAFE DELTA TRACKING)
                // ====================================================================
                let currentEnemyDeltaYaw = 0.0;
                
                // NẾU vẫn là thằng địch cũ, ta so sánh góc ngang hiện tại và góc của 16ms trước
                // Để biết chính xác nó đang lướt sang Trái hay Phải với tốc độ bao nhiêu độ/mili-giây!
                if (isStickyTarget) {
                    currentEnemyDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - previousEnemyYaw);
                }

                bestTarget = {
                    id: enemy.id, 
                    distance3D: distance3D,
                    distance2D: fov2D,              // Gửi 2D cho Trợ lực kéo
                    deltaPitch: rawDeltaPitch,      // Gửi 3D cho Khóa cứng
                    deltaYaw: rawDeltaYaw,          // Gửi 3D cho Khóa cứng
                    enemyDeltaYaw: currentEnemyDeltaYaw, // Gửi Vận tốc ngang cho X-Boost
                    absoluteEnemyYaw: enemyYaw      // Lưu lại để dùng cho Frame tiếp theo
                };
            }
        }

        // ====================================================================
        // XUẤT BÁO CÁO CẬP NHẬT VÀO VORTEX STATE
        // ====================================================================
        if (bestTarget) {
            state.target.id = bestTarget.id;
            state.target.distance3D = bestTarget.distance3D;
            state.target.distance2D = bestTarget.distance2D;
            state.target.pitchError = bestTarget.deltaPitch; 
            state.target.yawError = bestTarget.deltaYaw;
            
            // Lưu lại Vận tốc lướt ngang và Góc tuyệt đối
            state.target.enemyDeltaYaw = bestTarget.enemyDeltaYaw;
            state.target.lastEnemyYaw = bestTarget.absoluteEnemyYaw;
        } else {
            state.target.id = null;
            state.target.distance3D = 999.0;
            state.target.distance2D = 999.0;
            state.target.pitchError = 999.0;
            state.target.yawError = 999.0;
            
            state.target.enemyDeltaYaw = 0.0;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 3: VECTOR THRUST & GUIDANCE ENGINE (Động cơ Trợ lực Hướng tâm V7.0)
// Công nghệ: ADS 15px Pre-kick, 2D Vector Guidance, X-Axis Delta Auto-Pull, Euler Freezing.
// Nhiệm vụ: Bẻ cong quỹ đạo vuốt 2D, tự động trôi trục ngang, khóa 3D khi cận đích.
// ============================================================================
class VectorThrustEngine {
    
    static calculateSigmoidThrust(distance2D) {
        const MAX_THRUST = 10.0; 
        const MIN_THRUST = 0.25; 
        const MID_POINT = 8.0; 
        const SLOPE = 6.0;      
        let progress = 1.0 / (1.0 + Math.exp((distance2D - MID_POINT) / SLOPE));
        return MIN_THRUST + (MAX_THRUST - MIN_THRUST) * progress;
    }

    static execute(payload) {
        const state = _vortex.__VortexState;
        const input = state.input;
        const target = state.target;
        const engine = state.engine;
        const weapon = state.weapon;

        if (engine.remX === undefined) { engine.remX = 0; engine.remY = 0; }

        if (!target.id) return payload; 
        if (!payload.touch_delta) payload.touch_delta = { x: 0, y: 0 };

        // Đọc lực vuốt (Đã được làm mượt EMA từ Bước 1)
        let rawX = payload.touch_delta.x + engine.remX;
        let rawY = payload.touch_delta.y + engine.remY;

        // ====================================================================
        // [CÔNG NGHỆ 1]: SCOPE PRE-KICK (CHỈ HÍCH 15PX KHI BẬT ỐNG NGẮM)
        // ====================================================================
        const ADS_KICK_PIXELS = 15; 

        if (engine.isADS && weapon.isFiring && weapon.bulletCount === 1) {
            // Chỉ hích mồi nếu tâm còn cách đầu > 1.5 độ (Tránh vọt lố qua đầu)
            if (target.distance2D > 1.5) {
                rawY -= ADS_KICK_PIXELS; // Trừ Y = Vuốt lên trên
                
                // Ép hệ thống nhận diện có thao tác tay ảo
                input.isSwiping = true;
                if (input.magnitude === 0) {
                    input.magnitude = ADS_KICK_PIXELS;
                    input.dirX = 0; input.dirY = -1.0; 
                }
            }
        }

        let hasInput = input.isSwiping && input.magnitude > 0;
        let total2DError = target.distance2D; // Sử dụng khoảng cách Pixel 2D làm gốc

        if (!hasInput && total2DError >= 3.0) return payload; // Buông tay -> Trả lại game gốc

        // Lấy lực đẩy gốc (Giữ nguyên 100% sức mạnh cho cả Hip-fire lẫn Scope)
        let baseThrust = this.calculateSigmoidThrust(total2DError);
        
        let errMag = total2DError || 0.0001;
        // Vector chuẩn hóa từ Tâm màn hình chỉ thẳng tới Sọ địch
        let targetDirX = target.yawError / errMag; 
        let targetDirY = target.pitchError / errMag;
        
        let dotProduct = 0;
        if (hasInput) dotProduct = (input.dirX * targetDirX) + (input.dirY * targetDirY);

        // Tọa độ 3D Tuyệt đối (Dùng để khóa Euler)
        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);
        let absoluteBonePitch = currentPitch + target.pitchError;
        let absoluteBoneYaw = currentYaw + target.yawError;

        // ====================================================================
        // [CÔNG NGHỆ 2]: AUTO-PULL TRỤC X (STRAFE TRACKING ĐỘC LẬP)
        // ====================================================================
        // 1 độ lướt ngang của địch tương đương khoảng 18 pixels trên màn hình
        // Ta cộng trực tiếp vào trục X, hệ thống sẽ tự trôi theo địch!
        let autoPullX = target.enemyDeltaYaw * 18.0; 
        rawX += autoPullX;

        // Trợ lực nền cho trục X (X-Axis Boost)
        const X_AXIS_BOOST = 1.40; 

        // ====================================================================
        // PHA 3: KHÓA 3D EULER (VÙNG CHÂN KHÔNG < 3.0 ĐỘ)
        // ====================================================================
        if (total2DError < 3.0) {
            engine.isABSBraking = true;

            // Bứt phá lồng giam nếu vuốt cực gắt ngược hướng
            if (hasInput && input.magnitude > 7.0 && dotProduct < -0.6) {
                engine.isABSBraking = false;
                rawX *= 0.8; rawY *= 0.8; 
            } 
            else {
                // Đóng băng Màn hình -> Chuyển sang Khóa Tọa Độ 3D Không Gian
                rawX = 0; rawY = 0;
                
                // Nhích nhẹ xuống dưới cằm một chút để tránh ghim lố da đầu
                let perfectPitch = absoluteBonePitch + (target.pitchError > 0 ? -0.2 : 0.1); 
                let perfectYaw = absoluteBoneYaw;

                if (payload.camera) { 
                    payload.camera.pitch = perfectPitch; 
                    payload.camera.yaw = perfectYaw; 
                } else { 
                    payload.aim_pitch = perfectPitch; 
                    payload.aim_yaw = perfectYaw; 
                }
                
                // Khóa chết vật lý Engine
                if (payload.camera_constraints) {
                    payload.camera_constraints.max_pitch_speed = 99999.0;
                    payload.camera_constraints.max_yaw_speed = 99999.0;
                    payload.camera_constraints.friction = 0.0;
                    payload.camera_constraints.damping = 0.0;
                    payload.camera_constraints.recoil_recovery_scale = 0.0;
                }
            }
        } 
        // ====================================================================
        // PHA 2: HỖ TRỢ KÉO 2D (VECTOR GUIDANCE) (Sai số > 3.0 độ)
        // ====================================================================
        else if (hasInput) {
            engine.isABSBraking = false;

            if (dotProduct > 0.3) {
                // [CÔNG NGHỆ 3]: VECTOR GUIDANCE (BẺ CONG QUỸ ĐẠO MƯỢT MÀ)
                // Pha trộn (Blend) 75% lực tay của bạn + 25% hướng đi lý tưởng của Hệ thống
                // Cảm giác vuốt sẽ hoàn toàn là tay bạn, nhưng tâm tự lượn cong vào sọ
                let blendFactor = 0.25; 
                let guidedDirX = (input.dirX * (1.0 - blendFactor)) + (targetDirX * blendFactor);
                let guidedDirY = (input.dirY * (1.0 - blendFactor)) + (targetDirY * blendFactor);

                engine.thrustMultiplier = baseThrust * 0.90; 
                
                // Bơm lực theo quỹ đạo ĐÃ ĐƯỢC BẺ CONG
                // Kèm theo khuếch đại trục ngang để đuổi kịp tốc độ chạy
                rawX = (input.magnitude * guidedDirX * engine.thrustMultiplier * X_AXIS_BOOST) + autoPullX;
                rawY = (input.magnitude * guidedDirY * engine.thrustMultiplier);

                // Đệm phanh từ tính (Magnetic Cushion) khi sắp chạm mốc 3.0 độ
                if (total2DError < 8.0) {
                    let brakeFactor = 1.0 - ((total2DError - 3.0) / 5.0); 
                    rawX *= (1.0 - (brakeFactor * 0.8));
                    rawY *= (1.0 - (brakeFactor * 0.8));
                }
            } 
            else if (dotProduct < 0.0) {
                // Vuốt ngược -> Phanh
                rawX *= 0.25; 
                rawY *= 0.25;
            }
        }

        // Sub-pixel Remainder (Lưu phần lẻ)
        let finalX = Math.round(rawX);
        let finalY = Math.round(rawY);
        
        engine.remX = rawX - finalX;
        engine.remY = rawY - finalY;

        payload.touch_delta.x = finalX;
        payload.touch_delta.y = finalY;

        return payload;
    }
}

// ============================================================================
// [NEW] LÕI VŨ KHÍ: MARKSMAN CORE (SÚNG GÕ 1 VIÊN DE, WOODPECKER, SKS)
// ============================================================================
class MarksmanCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        const engine = _vortex.__VortexState.engine;

        if (payload.weapon) {
            // [CÔNG NGHỆ]: INVERSE BRAKING (PHANH NGHỊCH ĐẢO CHỐNG VỌT LỐ)
            if (engine.isABSBraking) {
                // Tâm đã khóa vào sọ. Triệt tiêu 100% độ giật nảy lên của dòng Marksman.
                // Điều này giúp DE/Woodpecker không bị nảy vọt qua da đầu ở viên đầu tiên.
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                
                // Thu gọn hồng tâm đến mức tối đa để đạn ghim thẳng 1 điểm
                payload.weapon.base_spread = 0.0001;
                payload.weapon.dynamic_spread = 0.0;
                payload.weapon.spread_add_per_shot = 0.0;

                // Phục hồi tâm ngay lập tức sau viên đạn
                if (payload.weapon.recoil_recovery) {
                    payload.weapon.recoil_recovery = 99999.0; 
                }
            } else {
                // Khi ở ngoài Vùng Khóa, giữ nguyên độ nảy tự nhiên để Anti-cheat không phát hiện
                payload.weapon.dynamic_spread *= 0.5; // Chỉ giảm 50% độ tản mát
            }
        }
        return payload;
    }
}

// ============================================================================
// BƯỚC 4: WEAPON SPECIFIC CORES (LÕI VŨ KHÍ & THAO TÚNG ĐƯỜNG ĐẠN)
// Công nghệ: Quantum Choke (SG), Zero-Bloom Loop (SMG), First-Shot Laser (AR), Inverse Braking (Marksman)
// Nhiệm vụ: Xóa sổ vật lý nảy nòng, hội tụ đạn và khóa cứng tia nhìn.
// ============================================================================

class ShotgunCore {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        if (payload.weapon) {
            // Khi tâm đang "dính" vào sọ (ABSBraking), ép chùm đạn thành tia Slug Laser
            if (engine.isABSBraking) {
                payload.weapon.base_spread = 0.0001; 
                payload.weapon.dynamic_spread = 0.0; 
                payload.weapon.max_spread = 0.0001;
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
            } else {
                // Giữ lại một ít độ xòe để tăng diện tích trúng mục tiêu khi chưa vào vùng ABS
                payload.weapon.dynamic_spread *= 0.15;
            }
        }
        return payload;
    }
}

class SMGCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        const engine = _vortex.__VortexState.engine;
        if (payload.weapon) {
            // Cơ chế sấy: Giảm giật tích tụ (Accumulation) theo chu kỳ đạn
            if (engine.isABSBraking) {
                if (weaponState.bulletCount % 2 === 0) {
                    payload.weapon.recoil_accumulation = 0.0;
                    payload.weapon.dynamic_spread = 0.0;
                } else {
                    payload.weapon.recoil_accumulation *= 0.1;
                    payload.weapon.dynamic_spread *= 0.1;
                }
                payload.weapon.recoil_y = 0.0; 
            }
        }
        return payload;
    }
}

class ARCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        const engine = _vortex.__VortexState.engine;
        if (payload.weapon) {
            // Cú hích viên đầu tiên (First-shot Laser)
            if (weaponState.bulletCount <= 1) {
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.base_spread = 0.0;
            } 
            // Ghìm tâm tuyệt đối khi sấy
            else if (engine.isABSBraking) {
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                payload.weapon.recoil_recovery = 99999.0; 
            }
        }
        return payload;
    }
}

class MarksmanCore {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        // [CÔNG NGHỆ MỚI]: PHANH NGHỊCH ĐẢO (INVERSE BRAKING)
        // Dành cho DE, Woodpecker, SKS, AC80, M590
        if (payload.weapon && engine.isABSBraking) {
            // Khi tâm lọt vào vùng ABS, Phanh nghịch đảo sẽ triệt tiêu 100% 
            // lực giật nảy nòng của súng gõ 1 viên.
            payload.weapon.recoil_y = -0.5; // Bơm phản lực ngược để giữ tâm đứng yên
            payload.weapon.recoil_accumulation = 0.0;
            payload.weapon.recoil_recovery = 99999.0;
            payload.weapon.base_spread = 0.0;
        }
        return payload;
    }
}

// ============================================================================
// LỚP BẢO HIỂM: ABSOLUTE RAY-DIR LOCK (ĐỒNG BỘ TIA ĐẠN THỰC THỂ)
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        if (engine.isABSBraking) {
            // Ép mọi tia đạn bay đúng vào mã xương Đầu (Head bone hash)
            if (payload.damage_report || payload.hit_event) {
                let report = payload.damage_report || payload.hit_event;
                report.hit_bone = -2111735698; // BONE_HASH: Đầu
                report.is_headshot = true;
                report.damage_multiplier = 1.35; // Tăng sát thương headshot nhẹ
            }
        }
        return payload;
    }
}

// ============================================================================
// BƯỚC 5: BALLISTICS SYNCHRONIZER (Lớp Bảo Hiểm Tia Đạn V7.0)
// Công nghệ: Smart Bone Hijacking, Magnetic Bullet Bending, Anti-Falloff.
// Nhiệm vụ: Xóa RNG, khóa tia đạn chính xác vào mục tiêu, khuếch đại sát thương.
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const engine = state.engine;
        const target = state.target;
        const weapon = state.weapon;

        // CHỈ can thiệp đường đạn khi Phanh ABS đã đóng băng được tâm súng tại sọ
        // VÀ hệ thống đã xác định được một Target cụ thể
        if (engine.isABSBraking && target.id !== null) {
            
            // ====================================================================
            // 1. ĐỒNG BỘ TIA ĐẠN VẬT LÝ (MAGNETIC BULLET BENDING)
            // ====================================================================
            if (payload.bullet_events) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    // Xóa bỏ tản mát ngẫu nhiên (RNG deviation)
                    bullet.spread_angle = 0.0; 
                    bullet.deviation = 0.0; 
                    bullet.angular_velocity = 0.0;
                    
                    // [CÔNG NGHỆ MỚI]: Đồng bộ vật lý đạn với thuật toán Đón Đầu ở Bước 2
                    if (bullet.trajectory) {
                        bullet.trajectory.gravity_scale = 0.0; // Tắt lực hút trái đất tác động lên viên đạn này
                        bullet.trajectory.drag = 0.0;          // Tắt lực cản gió
                    }

                    // Xuyên thấu ảo: Giúp đạn ghim vào sọ ngay cả khi địch lách nhẹ sau mép tường
                    bullet.is_penetrating = true; 
                    bullet.collision_obstacle = false;
                }
            }

            // ====================================================================
            // 2. MÃ HÓA CỨNG BÁO CÁO SÁT THƯƠNG (SMART BONE HIJACKING)
            // ====================================================================
            if (payload.damage_report || payload.hit_event) {
                // Hỗ trợ mảng (Array) cho các súng bắn ra nhiều tia cùng lúc như Shotgun
                let reports = payload.damage_report ? 
                              (Array.isArray(payload.damage_report) ? payload.damage_report : [payload.damage_report]) : 
                              (Array.isArray(payload.hit_event) ? payload.hit_event : [payload.hit_event]);

                for (let r = 0; r < reports.length; r++) {
                    let report = reports[r];

                    // CHỐT CHẶN AN TOÀN: Chỉ đổi thành Headshot nếu trúng ĐÚNG thằng đang khóa.
                    // Nếu lỡ bắn trúng thằng khác chạy ngang qua, giữ nguyên sát thương gốc để tránh bị Report.
                    if (report.target_id === target.id || report.entity_id === target.id) {
                        
                        // -2111735698 chính là mã BONE_HASH tuyệt đối của xương Đầu (Head)
                        report.hit_bone = -2111735698; 
                        report.is_headshot = true;
                        
                        // Khai tử luật Suy hao sát thương tầm xa (Damage Falloff)
                        report.distance_penalty = 0.0; 

                        // Khuếch đại bạo kích tùy theo phân loại súng
                        if (weapon.type === "MARKSMAN" || weapon.type === "SNIPER" || weapon.type === "SHOTGUN") {
                            report.damage_multiplier = 1.50; // Súng gõ 1 viên cần kết liễu cực gắt
                        } else {
                            report.damage_multiplier = 1.35; // Súng sấy SMG/AR
                        }
                    }
                }
            }
        }
        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI (VORTEX DISPATCHER V7.0) - DÂY CHUYỀN LẮP RÁP (ASSEMBLY LINE)
// ============================================================================
class VortexDispatcher {
    
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        // Quét đệ quy tìm dữ liệu Game
        const rootKeys = ['data', 'events', 'payload', 'messages', 'vessels'];
        for (let i = 0; i < rootKeys.length; i++) {
            const key = rootKeys[i];
            if (payload[key]) {
                if (Array.isArray(payload[key])) {
                    for (let j = 0; j < payload[key].length; j++) {
                        payload[key][j] = this.processPayload(payload[key][j]);
                    }
                } else if (typeof payload[key] === 'object') {
                    payload[key] = this.processPayload(payload[key]);
                }
            }
        }

        const hasActionableData = payload.players || payload.weapon || payload.camera || payload.touch_delta || payload.input_drag || payload.bullet_events || payload.damage_report;
        if (!hasActionableData) return payload; 

        // --- DÂY CHUYỀN VORTEX V7.0 VẬN HÀNH ---
        
        // Nhịp 1: Đọc tay & Nhận diện súng
        payload = InputInterceptor.execute(payload);
        payload = WeaponAnalyzer.execute(payload);
        
        // Nhịp 2: Mắt thần quét 2D -> 3D
        payload = TargetScanner2D3D.execute(payload); 

        const weaponType = _vortex.__VortexState.weapon.type;
        
        if (weaponType !== "NONE" && weaponType !== "SNIPER") {
            
            // Nhịp 3: Động cơ tính lực đẩy Vector 2D và Bám trục X
            payload = VectorThrustEngine.execute(payload);

            // Nhịp 4: Điều hướng Core Vũ khí (Làm chủ độ giật)
            if (weaponType === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (weaponType === "SMG") payload = SMGCore.execute(payload);
            else if (weaponType === "AR") payload = ARCore.execute(payload);
            else if (weaponType === "MARKSMAN") payload = MarksmanCore.execute(payload); 

            // Nhịp 5: Đồng bộ tia đạn vật lý
            payload = BallisticsSynchronizer.execute(payload);
        }

        return payload;
    }
}

// ============================================================================
// ENGINE WRAPPER DÀNH CHO IOS SHORTCUTS
// ============================================================================
if (!_vortex.__VORTEX_ENGINE) {
    _vortex.__VORTEX_ENGINE = new VortexDispatcher();
}

function ProcessPayload(inputPayload) {
    try {
        let isString = typeof inputPayload === 'string';
        let payload = isString ? JSON.parse(inputPayload) : inputPayload;
        
        const mutated = _vortex.__VORTEX_ENGINE.processPayload(payload);
        
        return isString ? JSON.stringify(mutated) : mutated;
    } catch (e) {
        return inputPayload;
    }
}

const VORTEX_API = {
    ProcessPayload: ProcessPayload,
    Version: "VORTEX_V7.0_MECHANICAL_ORGANIC"
};

if (typeof window !== 'undefined') window.VORTEX = VORTEX_API;
else if (typeof globalThis !== 'undefined') globalThis.VORTEX = VORTEX_API;
else _vortex.VORTEX = VORTEX_API;

if (typeof module !== 'undefined') module.exports = VORTEX_API;
