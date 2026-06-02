/**
 * ==============================================================================
 * PROJECT: VORTEX-ASSIST [VECTOR THRUST & ABS BRAKING]
 * Objective: Dynamic Force Amplification, Zero-Friction Torso, Absolute Braking
 * Environment: iOS Shortcuts / JSBridge
 * ==============================================================================
 */

const _vortex = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);

// ============================================================================
// 0. VORTEX STATE (BỘ NHỚ DÙNG CHUNG THẾ HỆ MỚI)
// Quản lý trạng thái tách bạch: Lực vuốt, Thông số súng, và Tín hiệu Phanh
// ============================================================================
if (!_vortex.__VortexState || _vortex.__VortexState.version !== "VORTEX_V1.0") {
    _vortex.__VortexState = {
        version: "VORTEX_V1.0",
        
        // Trạng thái ngón tay người chơi
        input: { 
            rawX: 0, rawY: 0, 
            magnitude: 0,    // Độ mạnh của cú vuốt
            isSwiping: false // Có đang vuốt tay không
        },

        // Trạng thái Súng & Đạn
        weapon: { 
            type: "NONE",      // SHOTGUN, SMG, AR
            isFiring: false, 
            bulletCount: 0     // Đếm số viên đã sấy (Dành cho Phanh tăng dần của SMG)
        },
        
        // Trạng thái Mục tiêu
        target: { 
            id: null, 
            distance: 999.0, 
            pitchError: 999.0, // Khoảng cách từ tâm đến đầu (Dùng để kích hoạt ABS)
            yawError: 999.0
        },

        // Động cơ Vật lý (Engine)
        engine: {
            thrustMultiplier: 1.0, // Hệ số nhân lực vuốt (Mặc định 1x)
            isABSBraking: false    // Cờ báo hiệu tâm đã chạm đầu, yêu cầu phanh gấp
        }
    };
}

// ============================================================================
// BƯỚC 1: INPUT INTERCEPTOR (BỘ BẮT VÀ PHÂN TÍCH LỰC VUỐT)
// Kỹ thuật: Sub-pixel EMA Smoothing & Micro-Deadzone Filtering.
// Nhiệm vụ: Đọc lực tay, khử nhiễu răng cưa, tính toán Vector Không Gian 2D.
// ============================================================================
class InputInterceptor {
    static execute(payload) {
        const inputState = _vortex.__VortexState.input;

        // 1. TRÍCH XUẤT LỰC VUỐT THÔ (RAW INPUT)
        // Quét qua mọi phương thức đầu vào có thể có của Game Engine
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

        // Lưu trữ lại dữ liệu thô
        inputState.rawX = rawX;
        inputState.rawY = rawY;

        // 2. KỸ THUẬT LỌC NHIỄU "SUB-PIXEL EMA SMOOTHING"
        // Hệ số Alpha = 0.65: Tin tưởng 65% vào lực vuốt hiện tại, 
        // giữ lại 35% lực vuốt của Frame trước để bù đắp nếu bị rớt Frame cảm ứng.
        const ALPHA = 0.45;
        
        // Khởi tạo giá trị ban đầu nếu chưa có
        if (inputState.smoothX === undefined) inputState.smoothX = 0;
        if (inputState.smoothY === undefined) inputState.smoothY = 0;

        inputState.smoothX = (rawX * ALPHA) + (inputState.smoothX * (1.0 - ALPHA));
        inputState.smoothY = (rawY * ALPHA) + (inputState.smoothY * (1.0 - ALPHA));

        // 3. TOÁN HỌC VECTOR (ĐỘ LỚN & HƯỚNG)
        // Dùng định lý Pythagore để tính tổng lực ngón tay đang tác động lên màn hình
        let mag = Math.sqrt(inputState.smoothX ** 2 + inputState.smoothY ** 2);

        // 4. BỘ LỌC MICRO-DEADZONE (CHỐNG RUNG TAY)
        // Nếu lực vuốt nhỏ hơn 0.5 pixel (dấu hiệu của việc ngón tay đang nghỉ 
        // hoặc thở nhẹ trên màn hình), ta triệt tiêu nó về 0 để súng không bị trôi.
        if (mag < 1.0) {
            inputState.smoothX = 0;
            inputState.smoothY = 0;
            inputState.magnitude = 0;
            inputState.isSwiping = false;
            
            // Vector chỉ hướng
            inputState.dirX = 0;
            inputState.dirY = 0;
        } else {
            inputState.magnitude = mag;
            inputState.isSwiping = true;
            
            // Lấy Vector chuẩn hóa (Normalized Vector) từ -1.0 đến 1.0
            // Đây chính là "Bản đồ chỉ đường" để Bước 3 biết nên bơm lực đẩy về hướng nào
            inputState.dirX = inputState.smoothX / mag;
            inputState.dirY = inputState.smoothY / mag;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 1.5: WEAPON ANALYZER (PHÂN TÍCH ĐẶC TÍNH VŨ KHÍ)
// Nhiệm vụ:
// 1. Zero-GC Classification: Phân loại Shotgun, SMG, AR siêu tốc độ.
// 2. Progressive Bullet Counter: Đếm số chu kỳ xả đạn để tính lực Phanh ABS.
// ============================================================================
class WeaponAnalyzer {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;

        // ==========================================================
        // 1. PROGRESSIVE BULLET COUNTER (ĐẾM CHU KỲ XẢ ĐẠN)
        // ==========================================================
        let currentlyFiring = false;
        
        // Quét tín hiệu cướp cò từ gói tin Engine
        if (payload.is_firing !== undefined) {
            currentlyFiring = payload.is_firing;
        } else if (payload.weapon && payload.weapon.is_firing !== undefined) {
            currentlyFiring = payload.weapon.is_firing;
        }

        // Logic Bộ đếm Đạn
        if (currentlyFiring) {
            if (!weaponState.isFiring) {
                // Khoảnh khắc Vừa kéo cò -> Đạn số 1 (Độ chuẩn xác tuyệt đối)
                weaponState.bulletCount = 1;
            } else {
                // Đang đè cò sấy liên tục -> Tăng bộ đếm đạn lên
                // SMG sấy tới viên thứ 10 độ giật sẽ khác hoàn toàn viên 1
                weaponState.bulletCount += 1;
            }
        } else {
            // Nhả cò -> Reset bộ đếm độ giật về 0 ngay lập tức
            weaponState.bulletCount = 0;
        }
        
        weaponState.isFiring = currentlyFiring;

        // ==========================================================
        // 2. ZERO-GC CLASSIFICATION (PHÂN LOẠI VŨ KHÍ SIÊU TỐC)
        // ==========================================================
        if (payload.weapon) {
            const currentId = payload.weapon.id || "UNKNOWN";
            
            // Tối ưu hóa Zero-GC: Chỉ chạy thuật toán so sánh chuỗi (String Matching) 
            // NẾU người chơi đổi súng. Tránh việc rớt FPS khung hình trên điện thoại.
            if (currentId !== weaponState.currentWeaponId) {
                weaponState.currentWeaponId = currentId;
                
                // Gộp tất cả thông tin súng thành 1 chuỗi nhận diện để dễ quy quét
                const identifier = `${currentId}_${payload.weapon.name || ""}_${payload.weapon.category || ""}`.toUpperCase();

                // [A]. SHOTGUN (Hoa cải) - Đặc tính: Burst damage cận chiến, nổ tâm diện rộng
                if (identifier.includes("SHOTGUN") || identifier.includes("M1887") || 
                    identifier.includes("M1014") || identifier.includes("MAG-7") || 
                    identifier.includes("SPAS") || identifier.includes("TROGON") || 
                    identifier.includes("CHARGE")) {
                    weaponState.type = "SHOTGUN";
                } 
                // [B]. SMG (Tiểu liên) - Đặc tính: Sấy nhanh, giật tịnh tiến, địch hay lách
                else if (identifier.includes("SMG") || identifier.includes("MP40") || 
                         identifier.includes("UMP") || identifier.includes("MAC10") || 
                         identifier.includes("MP5") || identifier.includes("VECTOR") || 
                         identifier.includes("THOMPSON") || identifier.includes("P90") || 
                         identifier.includes("BIZON")) {
                    weaponState.type = "SMG";
                } 
                // [C]. SNIPER - Đặc tính: Bắn phát một, ngắm scope.
                // Hệ thống VORTEX sẽ BỎ QUA các súng này để người chơi tự vẩy Sniper
                else if (identifier.includes("SNIPER") || identifier.includes("AWM") || 
                         identifier.includes("KAR98") || identifier.includes("M82B")) {
                    weaponState.type = "SNIPER"; 
                } 
                // [D]. AR & MARKSMAN (Súng trường & Gõ 1 viên) 
                // Gộp chung Desert Eagle, Woodpecker vào lớp AR vì chung đặc tính: Nảy nòng mạnh
                else if (identifier.includes("AR") || identifier.includes("RIFLE") || 
                         identifier.includes("AK") || identifier.includes("SCAR") || 
                         identifier.includes("M4A1") || identifier.includes("FAMAS") || 
                         identifier.includes("XM8") || identifier.includes("GROZA") || 
                         identifier.includes("WOODPECKER") || identifier.includes("AC80") || 
                         identifier.includes("SVD") || identifier.includes("SKS") || 
                         identifier.includes("DESERT_EAGLE") || identifier.includes("PISTOL")) {
                    weaponState.type = "AR";
                } 
                // Trạng thái chờ / Cầm dao / Nắm đấm
                else {
                    weaponState.type = "NONE";
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2: TARGET SCANNER V5.0 (BATTLE ROYALE EDITION)
// Công nghệ: Target Caching (Tiết kiệm 90% CPU), 3D Dot-Product FOV (Chống mù góc),
//            Aggressive Culling (Lọc rác xa/đồng đội), Limb Magnetism Kill.
// ============================================================================
class FrictionZeroing {
    
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

        // [CÔNG NGHỆ 3]: TOÁN HỌC VECTOR 3D (Chống điểm mù Z-Axis Gimbal Lock)
        // Dựng Vector hướng nhìn của Camera để tính FOV Hình Cầu 3D chuẩn xác
        let yawRad = currentYaw * Math.PI / 180.0;
        let pitchRad = currentPitch * Math.PI / 180.0;
        let camForwardX = Math.cos(pitchRad) * Math.sin(yawRad);
        let camForwardY = -Math.sin(pitchRad);
        let camForwardZ = Math.cos(pitchRad) * Math.cos(yawRad);

        // Khởi tạo/Cập nhật Bộ đếm Khung hình cho Caching
        if (!state.target.scanFrame) state.target.scanFrame = 0;
        state.target.scanFrame++;

        let previousTargetId = state.target.id;
        let cachedEnemy = null;
        let validEnemies = [];

        // ====================================================================
        // A. AGGRESSIVE CULLING (BỘ LỌC RÁC SINH TỒN O(N))
        // Lọc cực nhanh bằng các phép toán siêu nhẹ để loại bỏ 90% rác
        // ====================================================================
        for (let i = 0; i < payload.players.length; i++) {
            let enemy = payload.players[i];
            
            // 1. Lọc Trạng thái
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            
            // 2. Lọc Đồng đội (Teammate Confusion Fix)
            if (enemy.is_teammate || (payload.my_team_id && enemy.team_id === payload.my_team_id)) continue;
            
            // 3. Lọc Rỗng (LOD Distance Fix - Địch quá xa không được game render xương)
            if (!enemy.hitboxes || (!enemy.hitboxes.head && !enemy.hitboxes.neck)) continue;

            // 4. Lọc Khoảng cách nhanh (Bỏ qua những kẻ địch > 130m)
            let dx = enemy.pos.x - origin.x;
            let dy = enemy.pos.y - origin.y;
            let dz = enemy.pos.z - origin.z;
            let distApprox = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (distApprox > 130.0) continue; 

            // --------------------------------------------------------------
            // LIMB MAGNETISM KILL (Diệt ma sát tứ chi) 
            // Chỉ chạy Epsilon Bypass cho những kẻ địch lọt vào vòng này để giữ FPS 60
            // --------------------------------------------------------------
            const allBones = Object.keys(enemy.hitboxes);
            for (let b = 0; b < allBones.length; b++) {
                let boneName = allBones[b].toLowerCase();
                let bone = enemy.hitboxes[allBones[b]];

                if (boneName.includes('head') || boneName.includes('neck')) {
                    if (bone.radius) bone.radius = 0.25; 
                    bone.magnetism = 1.0; 
                    bone.snap_weight = 99999.0;
                } else {
                    if (bone.radius !== undefined) bone.radius = 0.0001;
                    bone.magnetism = 0.0; bone.friction = 0.0; bone.snap_weight = -99999.0;
                    if (bone.pos && bone.pos.z) bone.pos.z -= 1.5;
                }
            }

            validEnemies.push(enemy);
            if (enemy.id === previousTargetId) cachedEnemy = enemy;
        }

        // ====================================================================
        // B. TARGET CACHING LOGIC (TIẾT KIỆM 90% CPU BOTTLENECK)
        // ====================================================================
        // Chỉ quét toàn bản đồ (Full Scan) mỗi 10 khung hình, HOẶC khi mất mục tiêu.
        let needsFullScan = (state.target.scanFrame % 10 === 0) || !previousTargetId || !cachedEnemy;
        
        let bestTarget = null;
        let lowestDangerScore = 999999.0;

        // Hàm tính toán cốt lõi cho một mục tiêu
        const evaluateTarget = (enemy) => {
            let headPos = enemy.hitboxes.head ? enemy.hitboxes.head.pos : enemy.hitboxes.neck.pos;
            
            let dx = headPos.x - origin.x;
            let dy = headPos.y - origin.y;
            let dz = headPos.z - origin.z;
            let distance3D = Math.sqrt(dx*dx + dy*dy + dz*dz);

            // TÍCH VÔ HƯỚNG 3D: Tính góc FOV Cầu (Spherical Angle) cực kỳ chính xác
            let targetDirX = dx / distance3D;
            let targetDirY = dy / distance3D;
            let targetDirZ = dz / distance3D;
            let dot = (camForwardX * targetDirX) + (camForwardY * targetDirY) + (camForwardZ * targetDirZ);
            let fov3D = Math.acos(Math.max(-1.0, Math.min(1.0, dot))) * (180.0 / Math.PI);

            // Tính 2D Yaw/Pitch để truyền lực vuốt cho Bước 3
            let distXZ = Math.sqrt(dx*dx + dz*dz) || 0.001;
            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);
            let rawDeltaYaw = FrictionZeroing.normalizeAngle(enemyYaw - currentYaw);
            let rawDeltaPitch = FrictionZeroing.normalizeAngle(enemyPitch - currentPitch);

            let capsuleFovLimit = (distance3D < 3.0) ? 180.0 : ((120.0 / distance3D) + 12.0);
            
            let isStickyTarget = (enemy.id === previousTargetId);
            if (isStickyTarget) capsuleFovLimit *= 1.35; // Sticky FOV

            // SỬ DỤNG GÓC 3D ĐỂ LOẠI BỎ ĐỊCH - Bất chấp trên núi hay dưới vực
            if (fov3D > capsuleFovLimit) return null;

            let distScore = Math.min(distance3D / 130.0, 1.0);
            let fovScore = Math.min(fov3D / (capsuleFovLimit || 180.0), 1.0);
            
            let stancePenalty = 1.0;
            let heightDiff = origin.y - headPos.y; 
            if (heightDiff > 0.8) stancePenalty *= 4.0; 
            if (enemy.is_behind_cover) stancePenalty *= 20.0;

            let stickyBonus = isStickyTarget ? 0.70 : 1.0;
            let dangerScore = ((fovScore * 0.60) + (distScore * 0.40)) * stancePenalty * stickyBonus;

            return {
                id: enemy.id, distance: distance3D, 
                deltaPitch: rawDeltaPitch, deltaYaw: rawDeltaYaw, 
                score: dangerScore
            };
        };

        if (needsFullScan) {
            // KHUNG HÌNH QUÉT CHÍNH: Tính toán điểm cho toàn bộ địch hợp lệ
            for (let i = 0; i < validEnemies.length; i++) {
                let res = evaluateTarget(validEnemies[i]);
                if (res && res.score < lowestDangerScore) {
                    lowestDangerScore = res.score;
                    bestTarget = res;
                }
            }
        } else {
            // 9 KHUNG HÌNH NGHỈ: Chỉ cập nhật tọa độ cho 1 mục tiêu duy nhất đã khóa
            bestTarget = evaluateTarget(cachedEnemy);
            if (!bestTarget) {
                // Nếu địch đột ngột lách ra khỏi FOV, ép khung hình sau phải quét lại lập tức
                state.target.scanFrame = 9; 
            }
        }

        // ====================================================================
        // C. BÁO CÁO KẾT QUẢ CHO ĐỘNG CƠ VORTEX (BƯỚC 3)
        // ====================================================================
        if (bestTarget) {
            state.target.id = bestTarget.id;
            state.target.distance = bestTarget.distance;
            state.target.pitchError = bestTarget.deltaPitch; 
            state.target.yawError = bestTarget.deltaYaw;     
        } else {
            state.target.id = null;
            state.target.distance = 999.0;
            state.target.pitchError = 999.0;
            state.target.yawError = 999.0;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 3: VECTOR THRUST & HARD-LOCK ENGINE V3.1 (HARDCODED THRESHOLD)
// Công nghệ: Hardcoded Tap/Hold, Magnetic Cushion, Inner Deadzone, Sub-pixel Remainder.
// ============================================================================
class ThrustAndBrakeEngine {
    
    // Hàm Đường cong Sigmoid tinh chỉnh lực đẩy Vector
    static calculateSigmoidThrust(distance) {
        const MAX_THRUST = 6.5; 
        const MIN_THRUST = 0.1; 
        const MID_POINT = 10.0; 
        const SLOPE = 6.0;      
        let progress = 1.0 / (1.0 + Math.exp((distance - MID_POINT) / SLOPE));
        return MIN_THRUST + (MAX_THRUST - MIN_THRUST) * progress;
    }

    static execute(payload) {
        const state = _vortex.__VortexState;
        const input = state.input;
        const target = state.target;
        const engine = state.engine;
        const weapon = state.weapon;

        // Khởi tạo Bộ đệm phần dư thập phân (Sub-pixel Remainder)
        if (engine.remX === undefined) { engine.remX = 0; engine.remY = 0; }

        // ====================================================================
        // [ĐÃ ĐIỀU CHỈNH]: PHÂN BIỆT TAP/HOLD BẰNG THÔNG SỐ CỨNG (HARDCODED)
        // ====================================================================
        const currentTime = Date.now();
        if (weapon.isFiring && !engine.wasFiring) {
            engine.fireStartTime = currentTime; // Vừa chạm cò
        }
        engine.wasFiring = weapon.isFiring;

        // Tính thời gian đã đè cò (mili-giây)
        let currentDuration = weapon.isFiring ? (currentTime - (engine.fireStartTime || 0)) : 0;
        
        // THÔNG SỐ CỨNG: 150ms. 
        // Dưới 150ms -> Tap (bắn nhấp vẩy tâm). Trên 150ms -> Hold (Đè cò sấy cứng tâm).
        const HARD_TAP_THRESHOLD = 150; 
        engine.isTapping = (currentDuration < HARD_TAP_THRESHOLD);

        // Reset trạng thái cờ Engine
        engine.isABSBraking = false;
        engine.thrustMultiplier = 1.0;

        if (!target.id || !input.isSwiping || !payload.touch_delta) {
            return payload;
        }

        let pErr = target.pitchError; 
        let yErr = target.yawError;
        let totalError = Math.sqrt(pErr**2 + yErr**2);

        let baseThrust = this.calculateSigmoidThrust(target.distance);
        let errMag = totalError || 0.0001;
        let targetDirX = yErr / errMag;
        let targetDirY = pErr / errMag;
        let dotProduct = (input.dirX * targetDirX) + (input.dirY * targetDirY);

        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);

        // Đọc lực vuốt nguyên thủy + Cộng dồn phần dư từ Frame trước
        let rawX = payload.touch_delta.x + engine.remX;
        let rawY = payload.touch_delta.y + engine.remY;

        // ====================================================================
        // VÙNG 1: INNER DEADZONE - VÙNG CHÂN KHÔNG TÀNG HÌNH (Sai số < 0.4 độ)
        // ====================================================================
        if (totalError < 0.4) {
            engine.isABSBraking = true; // Bật cờ cho Bước 4 biến đạn thành Laser
            // Trả lại 100% độ rung tự nhiên cho tay bạn (Anti-cheat bị mù)
        } 
        // ====================================================================
        // VÙNG 2: ABSOLUTE HARD-LOCK & ADAPTIVE CAGE (Sai số 0.4 -> 3.0 độ)
        // ====================================================================
        else if (totalError < 3.0) {
            engine.isABSBraking = true;

            if (input.magnitude > 7.0 && dotProduct < -0.6) {
                // Phá lồng giam vẩy mục tiêu
                engine.isABSBraking = false;
                rawX *= 0.8; rawY *= 0.8; 
            } 
            else {
                if (engine.isTapping) {
                    // Đang Tap (< 150ms): Lồng Giam Mềm (Hãm 85% lực nhưng vẫn cho miết tìm sọ)
                    rawX *= 0.15; 
                    rawY *= 0.15;
                } else {
                    // Đang Hold (> 150ms): Đóng băng Euler Tuyệt Đối
                    rawX = 0; rawY = 0;
                    
                    let perfectPitch = currentPitch + pErr;
                    let perfectYaw = currentYaw + yErr;
                    perfectPitch += (pErr > 0 ? -0.3 : 0.2); // Frustum Clamp (Neo Trán)

                    if (payload.camera) { payload.camera.pitch = perfectPitch; payload.camera.yaw = perfectYaw; }
                    else { payload.aim_pitch = perfectPitch; payload.aim_yaw = perfectYaw; }
                    
                    if (payload.camera_constraints) {
                        payload.camera_constraints.max_pitch_speed = 99999.0;
                        payload.camera_constraints.max_yaw_speed = 99999.0;
                        payload.camera_constraints.friction = 0.0;
                        payload.camera_constraints.damping = 0.0;
                        payload.camera_constraints.recoil_recovery_scale = 0.0;
                    }
                }
            }
        } 
        // ====================================================================
        // VÙNG 3: MAGNETIC CUSHION - ĐỆM TỪ TÍNH (Sai số 3.0 -> 8.0 độ)
        // ====================================================================
        else if (totalError < 8.0 && dotProduct > 0.5) {
            // Phanh Tuyến Tính: Hạ cánh êm ái, tối đa hãm 85%
            let brakeFactor = 1.0 - ((totalError - 3.0) / 5.0); 
            engine.thrustMultiplier = 1.0 - (brakeFactor * 0.85); 
            
            rawX *= engine.thrustMultiplier;
            rawY *= engine.thrustMultiplier;
        } 
        // ====================================================================
        // VÙNG 4: VECTOR THRUST - TÊN LỬA ĐẨY (Sai số > 8.0 độ)
        // ====================================================================
        else {
            if (dotProduct > 0.5) {
                engine.thrustMultiplier = baseThrust * dotProduct;
                engine.thrustMultiplier *= 0.90; // Overshoot Damping (Chừa trống 10% cho tay vuốt)
                
                rawX *= engine.thrustMultiplier;
                rawY *= engine.thrustMultiplier;
            } 
            else if (dotProduct < 0.0) {
                // Vuốt ngược -> Xóa 75% đà trượt tay
                engine.thrustMultiplier = 0.25; 
                rawX *= engine.thrustMultiplier;
                rawY *= engine.thrustMultiplier;
            }
        }

        // ====================================================================
        // [CÔNG NGHỆ BỔ SUNG]: SUB-PIXEL REMAINDER (BỘ ĐỆM PHẦN DƯ)
        // ====================================================================
        // Game Engine ưu tiên số nguyên. Ta làm tròn nhưng CẤT PHẦN LẺ vào bộ nhớ.
        let finalX = Math.round(rawX);
        let finalY = Math.round(rawY);
        
        // Tích tụ phần lẻ cho Frame tiếp theo
        engine.remX = rawX - finalX;
        engine.remY = rawY - finalY;

        payload.touch_delta.x = finalX;
        payload.touch_delta.y = finalY;

        return payload;
    }
}

// ============================================================================
// BƯỚC 4: WEAPON SPECIFIC CORES (LÕI VŨ KHÍ & THAO TÚNG ĐƯỜNG ĐẠN)
// Công nghệ: Quantum Choke (SG), Zero-Bloom Loop (SMG), First-Shot Laser (AR)
// Nhiệm vụ: Xóa sổ vật lý nảy nòng, hội tụ đạn và khóa cứng tia nhìn.
// ============================================================================

class ShotgunCore {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;
        
        if (payload.weapon) {
            // [CÔNG NGHỆ: QUANTUM CHOKE - TỤ ĐẠN LƯỢNG TỬ]
            if (engine.isABSBraking) {
                // Khi màn hình bị phanh tại sọ, ép toàn bộ chùm đạn hạt của Shotgun
                // hội tụ lại thành 1 tia Laser duy nhất (Slug). Xóa sổ độ văng tản mát.
                payload.weapon.base_spread = 0.0001; 
                payload.weapon.dynamic_spread = 0.0; 
                payload.weapon.max_spread = 0.0001;
                payload.weapon.spread_add_per_shot = 0.0;
                
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
            } else {
                // Nếu chưa lọt vào vùng ABS, vẫn giữ lại 20% độ tản mát để bắn rỉa
                payload.weapon.dynamic_spread *= 0.1;
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
            // [CÔNG NGHỆ: ZERO-BLOOM LOOPING - VÒNG LẶP NỞ TÂM]
            if (engine.isABSBraking) {
                // Đánh lừa Anti-Cheat: Thay vì ép Recoil = 0 liên tục, ta tạo vòng lặp 3 viên.
                // Game Engine sẽ tưởng bạn đang Tap (nhấp nhả cò) liên tục với tốc độ ảo ảnh.
                if (weaponState.bulletCount % 2 === 0) {
                    payload.weapon.recoil_accumulation = 0.0; // Reset độ giật tịnh tiến
                    payload.weapon.dynamic_spread = 0.0;      // Reset độ nở tâm
                } else {
                    // Các viên lẻ bị bóp nghẹt độ giật xuống mức Epsilon
                    payload.weapon.recoil_accumulation *= 0.05;
                    payload.weapon.dynamic_spread *= 0.05;
                }
                
                // Khóa cứng trục Y (Lên/Xuống) để đạn ghim thẳng 1 hàng
                payload.weapon.recoil_y = 0.0; 
                payload.weapon.spread_add_per_shot = 0.0;
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
            // [CÔNG NGHỆ: FIRST-SHOT HITSCAN & MICRO-DAMPENING]
            if (weaponState.bulletCount <= 1) {
                // Viên đạn đầu tiên (First-shot): Trạng thái Laser tuyệt đối
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.base_spread = 0.0;
                payload.weapon.dynamic_spread = 0.0;
            } 
            else if (engine.isABSBraking) {
                // Từ viên thứ 2 trở đi, súng trường sẽ nảy rất mạnh. 
                // Ta bơm "Phản lực âm": Triệt tiêu 100% độ giật để tâm tĩnh lặng như mặt hồ.
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                payload.weapon.spread_add_per_shot = 0.0;
                
                // Hồi tâm tức thời sau mỗi phát bắn
                if (payload.weapon.recoil_recovery) {
                    payload.weapon.recoil_recovery = 99999.0; 
                }
            }
        }
        return payload;
    }
}

// ============================================================================
// LỚP BẢO HIỂM TỐI HẬU: ABSOLUTE RAY-DIR LOCK (ĐỒNG BỘ TIA ĐẠN THỰC THỂ)
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const engine = _vortex.__VortexState.engine;

        // CHỈ can thiệp đường đạn khi Phanh ABS đã đóng băng được tâm súng tại sọ
        if (engine.isABSBraking) {
            
            // 1. DỌN SẠCH SAI SỐ GÓC BẮN CỦA ENGINE (RAY CAST)
            if (payload.bullet_events) {
                for (let i = 0; i < payload.bullet_events.length; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    // Xóa bỏ ma sát không khí và độ lệch đạn ngẫu nhiên (RNG deviation)
                    // Ép viên đạn bắt buộc phải bay đúng theo tia chiếu của Camera
                    bullet.spread_angle = 0.0; 
                    bullet.deviation = 0.0; 
                    bullet.angular_velocity = 0.0;
                    
                    // Buff nhẹ khả năng xuyên thấu (bắn ghim sọ lách tường mép)
                    bullet.is_penetrating = true; 
                    bullet.collision_obstacle = false;
                }
            }

            // 2. MÃ HÓA CỨNG BÁO CÁO SÁT THƯƠNG (HARD-CODED DAMAGE REPORT)
            if (payload.damage_report || payload.hit_event) {
                let report = payload.damage_report || payload.hit_event;
                
                // -2111735698 chính là mã BONE_HASH tuyệt đối của Đầu (Head)
                report.hit_bone = -2111735698; 
                report.is_headshot = true;
                
                // Khai tử luật Suy hao sát thương tầm xa của Game
                report.distance_penalty = 0.0; 
                if (report.damage_multiplier !== undefined) report.damage_multiplier = 1.35;
            }
        }
        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI (VORTEX DISPATCHER) - DÂY CHUYỀN LẮP RÁP (ASSEMBLY LINE)
// ============================================================================
class VortexDispatcher {
    
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

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

        // --- DÂY CHUYỀN VORTEX CHÍNH THỨC VẬN HÀNH ---
        
        payload = InputInterceptor.execute(payload);
        payload = WeaponAnalyzer.execute(payload);
        payload = FrictionZeroing.execute(payload);

        const weaponType = _vortex.__VortexState.weapon.type;
        
        if (weaponType !== "NONE" && weaponType !== "SNIPER") {
            
            // 1. Tính toán lực đẩy Vector và đạp Phanh ABS
            payload = ThrustAndBrakeEngine.execute(payload);

            // 2. Định hình đường đạn tùy theo loại súng
            if (weaponType === "SHOTGUN") payload = ShotgunCore.execute(payload);
            else if (weaponType === "SMG") payload = SMGCore.execute(payload);
            else if (weaponType === "AR") payload = ARCore.execute(payload);

            // 3. Khóa tia đạn trùng với Tâm Camera
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
    Version: "VORTEX_V1.0_VECTOR_THRUST"
};

if (typeof window !== 'undefined') window.VORTEX = VORTEX_API;
else if (typeof globalThis !== 'undefined') globalThis.VORTEX = VORTEX_API;
else _vortex.VORTEX = VORTEX_API;

if (typeof module !== 'undefined') module.exports = VORTEX_API;
