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
// 0. VORTEX STATE V7.11 (BỘ NHỚ TOÀN CỤC & TÁI CHẾ OBJECT - ZERO GC)
// Đã tích hợp Object Pooling để chống khựng khung hình (Stutter) do rác RAM.
// ============================================================================
if (!_vortex.__VortexState || _vortex.__VortexState.version !== "VORTEX_V7.11") {
    _vortex.__VortexState = {
        version: "VORTEX_V7.11",
        
        // Trạng thái Input (Ngón tay & Ống ngắm)
        input: { rawX: 0, rawY: 0, smoothX: 0, smoothY: 0, magnitude: 0, isSwiping: false, dirX: 0, dirY: 0 },

        // Trạng thái Vũ khí
        weapon: { type: "NONE", isFiring: false, bulletCount: 0, currentWeaponId: null },
        
        // Trạng thái Mục tiêu
        target: { 
            id: null, scanFrame: 0, distance3D: 999.0, distance2D: 999.0, 
            pitchError: 999.0, yawError: 999.0, enemyDeltaYaw: 0.0,
            lastHeadPos: { x: 0, y: 0, z: 0 }, lastVelocity: { x: 0, y: 0, z: 0 }, ghostFrames: 0
        },

        // Động cơ Vật lý
        engine: { isADS: false, thrustMultiplier: 1.0, isABSBraking: false, remX: 0, remY: 0, wasADS: false, adsCalmFrames: 0 },

        localPlayer: { velocityY: 0.0, displacementY: 0.0 },

        // ====================================================================
        // [NEW] OBJECT POOLING: KHO TÁI CHẾ DỮ LIỆU
        // Khai báo sẵn các "vỏ hộp" để chứa dữ liệu, không bao giờ sinh rác.
        // ====================================================================
        pool: {
            // Dùng cho Bước 2: Lưu dữ liệu mục tiêu ngon ăn nhất
            tempTarget: { 
                id: null, distance3D: 999.0, distance2D: 999.0, deltaPitch: 0, deltaYaw: 0, 
                enemyDeltaYaw: 0, absoluteEnemyYaw: 0, rawHeadPos: {x:0, y:0, z:0}, 
                velocity: {x:0, y:0, z:0}, isGhost: false 
            },
            // Dùng cho Bước 2: Lưu dữ liệu nội suy của Bóng ma
            tempGhost: { 
                id: null, distance3D: 999.0, distance2D: 999.0, deltaPitch: 0, deltaYaw: 0, 
                enemyDeltaYaw: 0, absoluteEnemyYaw: 0, isGhost: true 
            },
            // Dùng cho Bước 5: Gói tin Sát thương Ảo (Phantom Damage) đã nạp đạn sẵn mã xương sọ
            phantomHit: { 
                target_id: 0, entity_id: 0, hit_bone: -2111735698, 
                is_headshot: true, distance_penalty: 0.0, damage_multiplier: 1.0, is_phantom_spoof: true 
            }
        }
    };
}

// ============================================================================
// BƯỚC 0.5: MEMORY AUTO-FLUSHER & SANITIZER (TỰ ĐỘNG DỌN DẸP & LỌC NHIỄU)
// Nhiệm vụ 1: Lọc bỏ các gói tin rác (NaN, Undefined) do lag mạng gây văng tâm.
// Nhiệm vụ 2: Tự động nhận diện trận đấu mới/sảnh chờ để xóa sạch "bóng ma" ván trước.
// Đảm bảo ván nào cũng có độ nhạy và lực kéo hoàn hảo như ván đầu tiên.
// ============================================================================
class MemoryAutoFlusher {
    static execute(payload) {
        const state = _vortex.__VortexState;

        // --------------------------------------------------------------------
        // [CÔNG NGHỆ BỔ SUNG] 1. SANITIZER: LỌC NHIỄU DỮ LIỆU ĐẦU VÀO (CHỐNG VĂNG TÂM)
        // Bắt các trường hợp payload bị rách do mạng lag (Ping 999+) hoặc Game Engine lỗi
        // --------------------------------------------------------------------
        if (payload.touch_delta) {
            if (isNaN(payload.touch_delta.x) || typeof payload.touch_delta.x !== 'number') payload.touch_delta.x = 0;
            if (isNaN(payload.touch_delta.y) || typeof payload.touch_delta.y !== 'number') payload.touch_delta.y = 0;
        }
        if (payload.camera) {
            // Nếu góc Camera bị mất dữ liệu, trả về số 0 để các phép tính toán học (Math.sqrt, atan2) ở Bước 2 không bị sập (Crash).
            if (isNaN(payload.camera.pitch) || typeof payload.camera.pitch !== 'number') payload.camera.pitch = 0;
            if (isNaN(payload.camera.yaw) || typeof payload.camera.yaw !== 'number') payload.camera.yaw = 0;
        }

        // --------------------------------------------------------------------
        // 2. NHẬN DIỆN TÍN HIỆU TRẬN MỚI (MATCH RESTART SENSOR)
        // --------------------------------------------------------------------
        let isNewMatch = false;

        // Cờ A: Nếu Game truyền thẳng trạng thái trận đấu (Sảnh chờ / Đang bay)
        if (payload.match_state && (payload.match_state === "LOBBY" || payload.match_state === "START")) {
            isNewMatch = true;
        } 
        // Cờ B: Nếu ID của trận đấu thay đổi
        else if (payload.match_id && payload.match_id !== state.currentMatchId) {
            isNewMatch = true;
            state.currentMatchId = payload.match_id;
        } 
        // Cờ C (Quan trọng nhất): Nhận diện biến động qua số lượng người chơi
        // Nếu đột ngột tụt về 0 (Ra sảnh) hoặc đột ngột tăng vọt lên 50 (Lên máy bay)
        else {
            let currentPlayerCount = payload.players ? payload.players.length : 0;
            if (state.lastPlayerCount !== undefined) {
                if ((currentPlayerCount === 0 && state.lastPlayerCount > 10) || 
                    (currentPlayerCount > 20 && state.lastPlayerCount < 5)) {
                    isNewMatch = true;
                }
            }
            state.lastPlayerCount = currentPlayerCount;
        }

        // --------------------------------------------------------------------
        // 3. KÍCH HOẠT QUY TRÌNH LỌC MÁU BỘ NHỚ (FLUSH)
        // --------------------------------------------------------------------
        if (isNewMatch) {
            // Xóa sạch bộ nhớ Mục tiêu (Kẻ địch ván trước, bóng ma, tọa độ cũ)
            state.target = { 
                id: null, 
                scanFrame: 0, 
                distance3D: 999.0, 
                distance2D: 999.0, 
                pitchError: 999.0, 
                yawError: 999.0, 
                enemyDeltaYaw: 0.0,
                lastHeadPos: { x: 0, y: 0, z: 0 },
                lastVelocity: { x: 0, y: 0, z: 0 },
                ghostFrames: 0
            };
            
            // Xóa sạch lực tay dư thừa và cờ khóa của Động cơ Vật lý
            state.engine = {
                isADS: false, 
                thrustMultiplier: 1.0, 
                isABSBraking: false, 
                remX: 0, 
                remY: 0,
                wasADS: false,
                adsCalmFrames: 0
            };
            
            // Xóa lực kéo cảm ứng và gia tốc EMA đang lưu trữ
            state.input = { 
                rawX: 0, rawY: 0, 
                smoothX: 0, smoothY: 0,
                magnitude: 0, 
                isSwiping: false, 
                dirX: 0, dirY: 0 
            };

            // Trả bộ đếm đạn và trạng thái bản thân về mặc định
            state.weapon.bulletCount = 0;
            state.weapon.isFiring = false;
            
            if (state.localPlayer) {
                state.localPlayer.velocityY = 0.0;
                state.localPlayer.displacementY = 0.0;
            }
        }

        return payload;
    }
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
        const ALPHA = 0.5; 
        
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
// [V7.3 UPDATE]: Khai tử hoàn toàn Súng Ngắm (Sniper), gán về trạng thái NONE.
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
                weaponState.bulletCount = 1; // Viên đầu tiên
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

                // [A]. NHÁNH MARKSMAN (Súng gõ 1 viên, độ nảy nòng cực gắt)
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
                // [D]. AR (Súng trường sấy tự động)
                else if (identifier.includes("AR") || identifier.includes("RIFLE") || 
                         identifier.includes("AK") || identifier.includes("SCAR") || 
                         identifier.includes("M4A1") || identifier.includes("FAMAS") || 
                         identifier.includes("XM8") || identifier.includes("GROZA") || 
                         identifier.includes("AUG") || identifier.includes("PISTOL")) {
                    weaponState.type = "AR";
                } 
                // [E]. TRẠNG THÁI NONE (Khai tử Sniper, Vũ khí cận chiến, Lựu đạn)
                // Bất kỳ súng nào không lọt vào A, B, C, D (bao gồm cả AWM, KAR98) sẽ rơi vào đây
                else {
                    weaponState.type = "NONE";
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2.5: SELF-KINEMATIC ISOLATOR (CÁCH LY ĐỘNG HỌC BẢN THÂN)
// Công nghệ: 
// 1. Zero-Stance Illusion (Đánh lừa trạng thái di chuyển để chống Nở Tâm).
// 2. Tách xuất Vận tốc Y để phục vụ Bù trừ điểm ngắm.
// ============================================================================
class SelfKinematicIsolator {
    static execute(payload) {
        const state = _vortex.__VortexState;
        
        // Tìm kiếm dữ liệu của chính người chơi (Bản thân)
        let myPlayer = payload.local_player || payload.my_player;
        if (!myPlayer && payload.players) {
            // Nội suy nếu Game giấu trong mảng chung
            for (let i = 0; i < payload.players.length; i++) {
                if (payload.players[i].is_local || payload.players[i].id === payload.my_id) {
                    myPlayer = payload.players[i];
                    break;
                }
            }
        }

        if (myPlayer) {
            // [CÔNG NGHỆ 4]: TRÍCH XUẤT VẬN TỐC TRỤC Y (Trọng lực/Nhảy)
            // Lấy vận tốc thực tế trước khi hệ thống đánh tráo nó về 0
            let myVelY = myPlayer.real_velocity ? myPlayer.real_velocity.y : (myPlayer.velocity ? myPlayer.velocity.y : 0);
            state.localPlayer.velocityY = myVelY;
            
            // Tính toán khoảng dịch chuyển dự kiến của Camera trong 1 Frame (16ms)
            state.localPlayer.displacementY = myVelY * 0.016;

            // [CÔNG NGHỆ 1]: ZERO-STANCE ILLUSION (Ảo ảnh Đứng im)
            // Ép Game Engine tin rằng bạn đang ngồi/đứng im tĩnh lặng để triệt tiêu Movement Bloom
            myPlayer.is_moving = false;
            myPlayer.is_jumping = false;
            myPlayer.is_falling = false;
            myPlayer.is_crouching = true; // Ép trạng thái về Ngồi (Độ tản mát nhỏ nhất)
            
            if (myPlayer.velocity) {
                myPlayer.velocity.x = 0.0; myPlayer.velocity.y = 0.0; myPlayer.velocity.z = 0.0;
            }
            if (myPlayer.real_velocity) {
                myPlayer.real_velocity.x = 0.0; myPlayer.real_velocity.y = 0.0; myPlayer.real_velocity.z = 0.0;
            }
        }

        // Bọc lót đánh lừa trực tiếp tham số Vũ khí (Weapon Movement Multiplier)
        if (payload.weapon) {
            payload.weapon.is_moving = false;
            payload.weapon.is_jumping = false;
            if (payload.weapon.movement_spread_multiplier !== undefined) payload.weapon.movement_spread_multiplier = 0.0;
            if (payload.weapon.jump_spread_multiplier !== undefined) payload.weapon.jump_spread_multiplier = 0.0;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2: TARGET SCANNER 2D-3D (V7.11 ZERO-GC & FAST-MATH)
// Cập nhật: Lọc khoảng cách bằng bình phương (Squared Culling) tiết kiệm 80% CPU.
// Cập nhật: Target-Only Bone Hijacking (Chỉ chỉnh xương mục tiêu bị khóa).
// Cập nhật: Object Pooling (Không sinh rác RAM).
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

        let isADS = payload.is_ads || (payload.camera && payload.camera.fov && payload.camera.fov < 60.0);
        state.engine.isADS = isADS;

        state.target.scanFrame++;

        let previousTargetId = state.target.id;
        let previousEnemyYaw = state.target.lastEnemyYaw || 0.0; 

        // [CÔNG NGHỆ]: NGẮT CẦU CHÌ CƠ HỌC (CIRCUIT BREAKER)
        let isFiring = state.weapon.isFiring;
        if (isFiring && state.target.id && state.input.magnitude > 15.0) {
            state.target.id = null;             
            state.target.ghostFrames = 0;       
            previousTargetId = null;            
        }

        let lockedTargetId = (isFiring && state.target.id) ? state.target.id : null;

        // Tránh tạo rác RAM, dùng tham chiếu trực tiếp đến thực thể Game
        let bestTargetRef = null; 
        let lowest2DDistance = 999999.0; 
        const ASPECT_RATIO = 1.77; 
        let localDispY = state.localPlayer ? state.localPlayer.displacementY : 0.0;

        let pLen = payload.players.length;

        // ====================================================================
        // A. FAST-MATH CULLING LOOP (Quét Địch Siêu Tốc)
        // ====================================================================
        for (let i = 0; i < pLen; i++) {
            let enemy = payload.players[i];
            
            // Lọc sinh tồn cơ bản
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            if (enemy.is_teammate || (payload.my_team_id && enemy.team_id === payload.my_team_id)) continue;
            if (!enemy.hitboxes || (!enemy.hitboxes.head && !enemy.hitboxes.neck)) continue;

            // XUYÊN THỦNG VÒNG LẶP nếu đã khóa mục tiêu
            if (lockedTargetId && enemy.id !== lockedTargetId) continue;

            let headRef = enemy.hitboxes.head ? enemy.hitboxes.head.pos : enemy.hitboxes.neck.pos;

            // Bù trừ trọng lực bản thân TRỰC TIẾP bằng biến số (Không tạo object mới)
            let hX = headRef.x;
            let hY = headRef.y - localDispY;
            let hZ = headRef.z;

            let dx = hX - origin.x;
            let dy = hY - origin.y;
            let dz = hZ - origin.z;

            // [LỌC BÌNH PHƯƠNG - SQUARED CULLING]: 150m^2 = 22500
            // Nhanh hơn Math.sqrt gấp 5 lần. Những kẻ địch > 150m sẽ bị đá văng ngay lập tức.
            let distSq = (dx*dx) + (dy*dy) + (dz*dz);
            if (distSq > 22500.0) continue; 

            // Chỉ tính Căn bậc hai khi địch chắc chắn ở gần
            let distance3D = Math.sqrt(distSq);

            // Tính Euler 3D
            let distXZSq = (dx*dx) + (dz*dz);
            let distXZ = distXZSq > 0 ? Math.sqrt(distXZSq) : 0.001;

            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);
            
            let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
            let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);

            // Tính ma trận Elip 16:9
            let scaledDeltaPitch = rawDeltaPitch * ASPECT_RATIO;
            let fov2DSq = (rawDeltaYaw*rawDeltaYaw) + (scaledDeltaPitch*scaledDeltaPitch);
            let fov2D = Math.sqrt(fov2DSq);

            let baseCapsule = (distance3D < 3.0) ? 180.0 : ((120.0 / distance3D) + 12.0);
            let capsuleFovLimit = isADS ? (baseCapsule * 0.35) : baseCapsule; 
            
            let isStickyTarget = (enemy.id === previousTargetId);
            if (isStickyTarget) capsuleFovLimit *= 1.5; 

            if (fov2D > capsuleFovLimit) continue;

            let stancePenalty = 1.0;
            if ((origin.y - hY) > 0.8) stancePenalty *= 2.0; 
            if (enemy.is_behind_cover) stancePenalty *= 10.0;

            let stickyBonus = isStickyTarget ? 0.50 : 1.0;
            let score2D = fov2D * stancePenalty * stickyBonus;

            if (score2D < lowest2DDistance) {
                lowest2DDistance = score2D;
                bestTargetRef = enemy; // Chốt hạ tham chiếu mục tiêu

                // [ZERO-GC ALLOCATION]: Gọi "vỏ hộp" tái chế ra dùng
                let tmp = state.pool.tempTarget;
                tmp.id = enemy.id;
                tmp.distance3D = distance3D;
                tmp.distance2D = fov2D;
                tmp.deltaPitch = rawDeltaPitch;
                tmp.deltaYaw = rawDeltaYaw;
                tmp.absoluteEnemyYaw = enemyYaw;
                tmp.enemyDeltaYaw = isStickyTarget ? TargetScanner2D3D.normalizeAngle(enemyYaw - previousEnemyYaw) : 0.0;
                tmp.isGhost = false;

                // Tái chế tọa độ
                tmp.rawHeadPos.x = headRef.x;
                tmp.rawHeadPos.y = headRef.y;
                tmp.rawHeadPos.z = headRef.z;

                let eVel = enemy.real_velocity || enemy.velocity;
                if (eVel) {
                    tmp.velocity.x = eVel.x || 0;
                    tmp.velocity.y = eVel.y || 0;
                    tmp.velocity.z = eVel.z || 0;
                } else {
                    tmp.velocity.x = 0; tmp.velocity.y = 0; tmp.velocity.z = 0;
                }
            }
        }

        // ====================================================================
        // B. TARGET-ONLY BONE HIJACKING (Chỉ thao túng xương của kẻ bị săn)
        // Xóa bỏ tình trạng can thiệp xương thừa thãi cho 50 người chơi
        // ====================================================================
        if (bestTargetRef && bestTargetRef.hitboxes) {
            const hitboxes = bestTargetRef.hitboxes;
            const allBones = Object.keys(hitboxes);
            let bLen = allBones.length;

            for (let b = 0; b < bLen; b++) {
                let boneName = allBones[b].toLowerCase();
                let bone = hitboxes[allBones[b]];

                if (boneName.includes('head') || boneName.includes('neck')) {
                    if (bone.radius) bone.radius = 0.5; 
                    bone.magnetism = 5.0;               
                    bone.snap_weight = 99999.0;
                } else {
                    if (bone.radius !== undefined) bone.radius = 0.0001;
                    bone.magnetism = 0.0; 
                    bone.friction = 0.0; 
                    bone.snap_weight = -99999.0;
                    if (bone.pos && bone.pos.z !== undefined) bone.pos.z -= 1.5; 
                }
            }
        }

        // ====================================================================
        // C. CROSS-PATH GHOSTING (BÓNG MA GIAO CẮT ZERO-GC)
        // ====================================================================
        let finalTarget = bestTargetRef ? state.pool.tempTarget : null;

        if (lockedTargetId && !finalTarget) {
            if (state.target.ghostFrames < 15) { 
                state.target.ghostFrames++;

                let lastPos = state.target.lastHeadPos;
                let lastVel = state.target.lastVelocity;
                
                // Trực tiếp tính toán không sinh rác
                let gX = lastPos.x + (lastVel.x * 0.016);
                let gY = lastPos.y + (lastVel.y * 0.016) - localDispY;
                let gZ = lastPos.z + (lastVel.z * 0.016);

                let dx = gX - origin.x;
                let dy = gY - origin.y;
                let dz = gZ - origin.z;
                
                let distSq = (dx*dx) + (dy*dy) + (dz*dz);
                let distance3D = Math.sqrt(distSq);
                
                let distXZSq = (dx*dx) + (dz*dz);
                let distXZ = distXZSq > 0 ? Math.sqrt(distXZSq) : 0.001;
                
                let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);
                
                let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
                let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);
                let scaledDeltaPitch = rawDeltaPitch * ASPECT_RATIO;
                let fov2D = Math.sqrt((rawDeltaYaw*rawDeltaYaw) + (scaledDeltaPitch*scaledDeltaPitch));

                // [ZERO-GC ALLOCATION]: Kéo bóng ma từ kho tái chế
                let ghost = state.pool.tempGhost;
                ghost.id = lockedTargetId;
                ghost.distance3D = distance3D;
                ghost.distance2D = fov2D;
                ghost.deltaPitch = rawDeltaPitch;
                ghost.deltaYaw = rawDeltaYaw;
                ghost.absoluteEnemyYaw = enemyYaw;
                ghost.enemyDeltaYaw = state.target.enemyDeltaYaw; 
                ghost.isGhost = true;

                finalTarget = ghost;

                // Tịnh tiến tọa độ gốc trong bộ nhớ 
                state.target.lastHeadPos.x = gX;
                state.target.lastHeadPos.y = gY + localDispY; 
                state.target.lastHeadPos.z = gZ;

            } else {
                state.target.id = null;
                state.target.ghostFrames = 0;
            }
        }

        // ====================================================================
        // D. XUẤT BÁO CÁO VÀO VORTEX STATE 
        // ====================================================================
        if (finalTarget) {
            if (!finalTarget.isGhost) {
                state.target.ghostFrames = 0;
                
                // Copy giá trị nguyên thủy (Primitive copy) không dính reference rác
                state.target.lastHeadPos.x = finalTarget.rawHeadPos.x;
                state.target.lastHeadPos.y = finalTarget.rawHeadPos.y;
                state.target.lastHeadPos.z = finalTarget.rawHeadPos.z;
                
                state.target.lastVelocity.x = finalTarget.velocity.x;
                state.target.lastVelocity.y = finalTarget.velocity.y;
                state.target.lastVelocity.z = finalTarget.velocity.z;
            }

            state.target.id = finalTarget.id;
            state.target.distance3D = finalTarget.distance3D;
            state.target.distance2D = finalTarget.distance2D;
            state.target.pitchError = finalTarget.deltaPitch; 
            state.target.yawError = finalTarget.deltaYaw;
            
            state.target.enemyDeltaYaw = finalTarget.enemyDeltaYaw;
            state.target.lastEnemyYaw = finalTarget.absoluteEnemyYaw;
        } else {
            state.target.id = null;
            state.target.ghostFrames = 0;
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
// BƯỚC 3: VECTOR THRUST & GUIDANCE ENGINE (V7.9 OMNI-DIRECTIONAL DOMINANCE)
// Hợp thể các công nghệ tối thượng:
// 1. ADS Decapitation Protocol: Quick-scope cướp quyền Camera tức thời & Khiên chống giật.
// 2. Long-Range Hipfire (Khoảng cách > 8m):
//    - Depth-Scaling Thrust: Suy hao gia tốc theo chiều sâu 3D (Chống vọt lố).
//    - Dynamic Magnetic Expansion: Mở rộng vùng đệm từ tính lên 15.0 độ.
//    - Y-Axis Compression: Ép xẹp trục dọc (Y), giữ nguyên gia tốc trục ngang (X).
//    - Kinetic Energy Bleeding: Xả van áp suất, triệt tiêu lực vuốt tay hoảng loạn.
// 3. Asymmetric Snap-Lock: Lồng giam bất đối xứng (Dọc < 2.5 độ, Ngang < 6.0 độ).
// 4. Aggressive Velocity Blending: 75% AI dẫn đường + 25% Lực cơ học.
// ============================================================================
class VectorThrustEngine {
    
    // Hàm Đường cong Sigmoid (Gia tốc cơ bản)
    static calculateSigmoidThrust(distance2D) {
        const MAX_THRUST = 10.0; 
        const MIN_THRUST = 0.10; 
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

        // Khởi tạo Bộ nhớ đệm Sub-pixel & Biến trạng thái Ống ngắm
        if (engine.remX === undefined) { engine.remX = 0; engine.remY = 0; }
        if (engine.wasADS === undefined) engine.wasADS = false;
        if (engine.adsCalmFrames === undefined) engine.adsCalmFrames = 0;

        // Trạng thái bật ống ngắm hiện tại
        let isADS = engine.isADS;

        // ====================================================================
        // [CÔNG NGHỆ ỐNG NGẮM]: ADS DECAPITATION PROTOCOL (GIAO THỨC ĐOẠT MẠNG)
        // Nhận diện khoảnh khắc Edge-Trigger (Vừa mới bấm nút bật Scope)
        // ====================================================================
        if (isADS && !engine.wasADS && target.id !== null) {
            // Kích hoạt Khiên chống giật ngược (Anti-Pullback Shield) trong 5 frames (khoảng 80ms)
            engine.adsCalmFrames = 5; 
        }
        engine.wasADS = isADS; // Lưu lại lịch sử cho frame tiếp theo

        // Nếu mất dấu mục tiêu -> Trả lại Payload
        if (!target.id) return payload; 
        if (!payload.touch_delta) payload.touch_delta = { x: 0, y: 0 };

        // Lực tay thô thực tế
        let rawX = payload.touch_delta.x + engine.remX;
        let rawY = payload.touch_delta.y + engine.remY;
        let currentMag = input.magnitude;

        let total2DError = target.distance2D; 
        let dist3D = target.distance3D;

        // Tách sai số trục Dọc và trục Ngang
        let absPitchErr = Math.abs(target.pitchError);
        let absYawErr = Math.abs(target.yawError);

        // ====================================================================
        // [CÔNG NGHỆ BẮN XA]: LONG-RANGE HIP-FIRE ISOLATION (Tầm > 8m, Không Scope)
        // ====================================================================
        let isLongRangeHipFire = (!isADS && dist3D > 8.0);
        
        // 1. Dynamic Magnetic Expansion: Mở rộng vùng đệm phanh từ 8.0 lên 15.0 độ
        let maxCushionLimit = isLongRangeHipFire ? 15.0 : 8.0;

        if (isLongRangeHipFire && currentMag > 0) {
            // 2. Kinetic Energy Bleeding (Xả Động Năng Dư Thừa do hoảng loạn tay)
            if (currentMag > 10.0) {
                let excess = currentMag - 10.0;
                let bleedFactor = 10.0 / (10.0 + excess * 0.6); // Triệt tiêu mượt mà lực thừa
                rawX *= bleedFactor;
                rawY *= bleedFactor;
                currentMag *= bleedFactor;
            }
        }

        let hasInput = input.isSwiping && currentMag > 0;

        // Buông tay ngoài Lồng giam -> Giải phóng Camera
        if (!hasInput && (absPitchErr >= 2.5 || absYawErr >= 6.0) && total2DError >= 0.5 && engine.adsCalmFrames === 0) {
            return payload;
        }

        // 3. Depth-Scaling Thrust: Tính toán suy hao gia tốc theo chiều sâu 3D
        let baseThrust = this.calculateSigmoidThrust(total2DError);
        if (isLongRangeHipFire) {
            // Địch càng xa (VD 24m), lực đẩy càng bị gọt giảm (8/24 = 33% lực gốc)
            let depthMultiplier = Math.max(0.35, 8.0 / dist3D); 
            baseThrust *= depthMultiplier;
        }

        let errMag = Math.sqrt(target.yawError**2 + target.pitchError**2) || 0.0001;
        let targetDirX = target.yawError / errMag; 
        let targetDirY = target.pitchError / errMag;
        
        let dotProduct = 0;
        if (hasInput) dotProduct = (input.dirX * targetDirX) + (input.dirY * targetDirY);

        let currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);
        
        let absoluteBonePitch = currentPitch + target.pitchError;
        let absoluteBoneYaw = currentYaw + target.yawError;

        // ====================================================================
        // [CÔNG NGHỆ LÕI]: AGGRESSIVE VELOCITY BLENDING (75% AI - 25% HUMAN)
        // ====================================================================
        let blendedRawX = rawX;
        let blendedRawY = rawY;

        if (hasInput && dotProduct > 0.0) {
            let idealVx = currentMag * targetDirX;
            let idealVy = currentMag * targetDirY;
            let systemDomination = 0.75; 
            blendedRawX = (rawX * (1.0 - systemDomination)) + (idealVx * systemDomination);
            blendedRawY = (rawY * (1.0 - systemDomination)) + (idealVy * systemDomination);
        }

        let autoPullX = target.enemyDeltaYaw * 30.0; 
        const X_AXIS_BOOST = 1.50; 

        // ====================================================================
        // GIAO THỨC ĐOẠT MẠNG ỐNG NGẮM (QUICK-SCOPE HIJACKING)
        // ====================================================================
        if (engine.adsCalmFrames > 0) {
            engine.adsCalmFrames--;
            engine.isABSBraking = true;
            
            // Cướp quyền Mỏ neo 3D: Dịch chuyển lập tức vào Sọ, bỏ qua cơ chế hút ngực của Game
            rawX = 0; rawY = 0;
            let perfectPitch = absoluteBonePitch + (target.pitchError > 0 ? -0.1 : 0.1); 

            if (payload.camera) { 
                payload.camera.pitch = perfectPitch; 
                payload.camera.yaw = absoluteBoneYaw; 
            } else { 
                payload.aim_pitch = perfectPitch; 
                payload.aim_yaw = absoluteBoneYaw; 
            }
            
            // Khiên chống Lực hút Ngược: Tê liệt vật lý game trong chớp mắt
            if (payload.camera_constraints) {
                payload.camera_constraints.friction = 0.0;
                payload.camera_constraints.damping = 0.0;
            }
        }
        // ====================================================================
        // PHA 1 & 3: TÂM BÃO TÀNG HÌNH & LỒNG GIAM BẤT ĐỐI XỨNG
        // ====================================================================
        else if (total2DError < 0.5) {
            engine.isABSBraking = true; 
            if (!hasInput) {
                if (payload.camera) { 
                    payload.camera.pitch = absoluteBonePitch; 
                    payload.camera.yaw = absoluteBoneYaw; 
                } else { 
                    payload.aim_pitch = absoluteBonePitch; 
                    payload.aim_yaw = absoluteBoneYaw; 
                }
            }
        } 
        else if (absPitchErr < 3.0 && absYawErr < 6.0) {
            engine.isABSBraking = true;

            if (hasInput && currentMag > 7.0 && dotProduct < -0.6) {
                engine.isABSBraking = false;
                rawX *= 0.8; rawY *= 0.8; 
            } 
            else {
                rawX = 0; rawY = 0;
                let perfectPitch = absoluteBonePitch + (target.pitchError > 0 ? -0.2 : 0.15); 
                let perfectYaw = absoluteBoneYaw;

                if (payload.camera) { 
                    payload.camera.pitch = perfectPitch; 
                    payload.camera.yaw = perfectYaw; 
                } else { 
                    payload.aim_pitch = perfectPitch; 
                    payload.aim_yaw = perfectYaw; 
                }
                
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
        // PHA 2: TRỢ LỰC KÉO (MAGNETIC CUSHION & VECTOR THRUST)
        // ====================================================================
        else if (total2DError < maxCushionLimit && hasInput) {
            engine.isABSBraking = false;
            
            if (dotProduct > 0.0) {
                // Ranh giới phanh thay đổi linh hoạt tùy theo Hipfire xa hay gần
                let brakeBoundary = isLongRangeHipFire ? 5.0 : 3.0;
                let brakeFactor = 1.0 - ((total2DError - brakeBoundary) / (maxCushionLimit - brakeBoundary)); 
                let cushion = 1.0 - (brakeFactor * 0.85); 
                
                engine.thrustMultiplier = baseThrust * cushion; 
                
                let thrustX = engine.thrustMultiplier * X_AXIS_BOOST;
                let thrustY = engine.thrustMultiplier;

                // 4. Y-Axis Compression vs ADS Overdrive
                if (isADS) thrustY = 3.0; // Xé gió khi bật ngắm
                else if (isLongRangeHipFire) thrustY *= 0.45; // Ép xẹp trục dọc 55% khi Hipfire xa
                
                rawX = (blendedRawX * thrustX) + autoPullX;
                rawY = (blendedRawY * thrustY);
            } else {
                rawX *= 0.25; rawY *= 0.25; 
            }
        } 
        else if (hasInput) {
            engine.isABSBraking = false;

            if (dotProduct > 0.5) {
                engine.thrustMultiplier = baseThrust * 0.90; 
            } 
            else if (dotProduct > 0.0) {
                engine.thrustMultiplier = 1.0 + ((baseThrust - 1.0) * (dotProduct / 0.5));
                engine.thrustMultiplier *= 0.90;
            }
            else {
                engine.thrustMultiplier = 0.25; 
            }

            if (dotProduct > 0.0) {
                let thrustX = engine.thrustMultiplier * X_AXIS_BOOST;
                let thrustY = engine.thrustMultiplier;

                // 4. Y-Axis Compression vs ADS Overdrive
                if (isADS) thrustY = 4.5;
                else if (isLongRangeHipFire) thrustY *= 0.45; 
                
                rawX = (blendedRawX * thrustX) + autoPullX;
                rawY = (blendedRawY * thrustY);
            } else {
                rawX *= engine.thrustMultiplier;
                rawY *= engine.thrustMultiplier;
            }
        }

        // ====================================================================
        // BỘ ĐỆM PHẦN DƯ SUB-PIXEL
        // ====================================================================
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
                payload.weapon.dynamic_spread *= 0.0;
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
                    payload.weapon.dynamic_spread *= 0.0;
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

// ============================================================================
// BƯỚC 5: BALLISTICS SYNCHRONIZER (V7.11 ZERO-GC FAST-PATH)
// Cập nhật: Sử dụng Object Pooling cho Phantom Damage để dập tắt lag bộ nhớ.
// Cập nhật: Tối ưu vòng lặp (Early break) giảm tải CPU.
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const engine = state.engine;
        const target = state.target;
        const weapon = state.weapon;

        // Bỏ qua ngay lập tức nếu không có Target ID nào đang bị khóa (Chặn sớm tiết kiệm CPU)
        if (!target.id) return payload;

        let isLongRangeHipFire = (!engine.isADS && target.distance3D > 8.0);
        let isSystemEngaged = engine.isABSBraking || isLongRangeHipFire;

        if (!isSystemEngaged) return payload;

        let isWithinMagicTolerance = target.distance2D < 10.0;

        // ====================================================================
        // [LÕI 1]: HITBOX INFLATION (TỐI ƯU EARLY-BREAK)
        // ====================================================================
        if (isLongRangeHipFire && isWithinMagicTolerance && payload.players) {
            let pLen = payload.players.length; // Caching độ dài mảng
            for (let i = 0; i < pLen; i++) {
                let enemy = payload.players[i];
                if (enemy.id === target.id && enemy.hitboxes) {
                    let head = enemy.hitboxes.head || enemy.hitboxes.neck;
                    if (head) {
                        head.radius = 0.5 + (target.distance3D * 0.03);
                        head.magnetism = 99.0; 
                        break; // Đã tìm thấy mục tiêu bị khóa, ngắt vòng lặp ngay lập tức
                    }
                }
            }
        }

        // ====================================================================
        // [LÕI 2]: TRAJECTORY VECTOR HIJACKING (FAST-MATH)
        // ====================================================================
        let bulletFiredThisFrame = false;

        if (payload.bullet_events) {
            let bLen = payload.bullet_events.length;
            if (bLen > 0) {
                bulletFiredThisFrame = true;

                for (let i = 0; i < bLen; i++) {
                    let bullet = payload.bullet_events[i];
                    
                    bullet.spread_angle = 0.0; 
                    bullet.deviation = 0.0; 
                    bullet.angular_velocity = 0.0;
                    
                    if (bullet.trajectory) {
                        bullet.trajectory.gravity_scale = 0.0; 
                        bullet.trajectory.drag = 0.0;          

                        if (isLongRangeHipFire && isWithinMagicTolerance && target.lastHeadPos) {
                            let originX = bullet.origin ? bullet.origin.x : (payload.fire_origin ? payload.fire_origin.x : 0);
                            let originY = bullet.origin ? bullet.origin.y : (payload.fire_origin ? payload.fire_origin.y : 0);
                            let originZ = bullet.origin ? bullet.origin.z : (payload.fire_origin ? payload.fire_origin.z : 0);

                            // Tính toán Bình phương khoảng cách trước để tiết kiệm Math.sqrt nếu bằng 0
                            let dx = target.lastHeadPos.x - originX;
                            let dy = target.lastHeadPos.y - originY;
                            let dz = target.lastHeadPos.z - originZ;
                            let distSq = (dx*dx) + (dy*dy) + (dz*dz);

                            if (distSq > 0) {
                                let dist = Math.sqrt(distSq);
                                bullet.trajectory.dir_x = dx / dist;
                                bullet.trajectory.dir_y = dy / dist;
                                bullet.trajectory.dir_z = dz / dist;
                            }
                        }
                    }

                    bullet.is_penetrating = true; 
                    bullet.collision_obstacle = false;
                }
            }
        }

        // ====================================================================
        // [LÕI 3]: SMART BONE HIJACKING & OBJECT-POOLING PHANTOM DAMAGE
        // ====================================================================
        let dmgMultiplier = (weapon.type === "MARKSMAN" || weapon.type === "SNIPER" || weapon.type === "SHOTGUN") ? 1.50 : 1.35;
        let hasDamageReportRegistered = false;

        if (payload.damage_report || payload.hit_event) {
            let reports = payload.damage_report ? 
                          (Array.isArray(payload.damage_report) ? payload.damage_report : [payload.damage_report]) : 
                          (Array.isArray(payload.hit_event) ? payload.hit_event : [payload.hit_event]);

            let rLen = reports.length;
            for (let r = 0; r < rLen; r++) {
                let report = reports[r];

                if (report.target_id === target.id || report.entity_id === target.id) {
                    hasDamageReportRegistered = true;
                    report.hit_bone = -2111735698; 
                    report.is_headshot = true;
                    report.distance_penalty = 0.0; 
                    report.damage_multiplier = dmgMultiplier;
                }
            }
        }

        // KÍCH HOẠT PHANTOM DAMAGE (ZERO-GC ALLOCATION)
        if (weapon.isFiring && bulletFiredThisFrame && !hasDamageReportRegistered && target.distance2D < 5.0) {
            
            // Lấy "vỏ hộp" có sẵn từ State Pool thay vì tạo mới {}
            let phantomHit = state.pool.phantomHit;
            
            // Chỉ ghi đè các tham số động, các tham số tĩnh (hit_bone, is_headshot) đã được gán sẵn
            phantomHit.target_id = target.id;
            phantomHit.entity_id = target.id;
            phantomHit.damage_multiplier = dmgMultiplier;

            if (!payload.hit_event) payload.hit_event = [];
            if (!Array.isArray(payload.hit_event)) payload.hit_event = [payload.hit_event];
            
            // Đẩy vỏ hộp này lên máy chủ
            payload.hit_event.push(phantomHit);
        }

        return payload;
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỐI ƯU (VORTEX DISPATCHER V7.11 FAST-PATH ROUTER)
// Công nghệ: Path-Caching (Ghi nhớ đường dẫn). Loại bỏ hoàn toàn vòng lặp đệ quy 
// nặng nề của các phiên bản trước. Tiết kiệm 80% CPU, chống nóng máy và tụt FPS.
// ============================================================================
class VortexDispatcher {
    constructor() {
        // Bộ nhớ lưu trữ "địa chỉ" của gói tin (Trí nhớ ngắn hạn)
        this.cachedPath = null;
    }

    // 1. HÀM KIỂM ĐỊNH (Nhận diện cục dữ liệu chứa tọa độ/vũ khí)
    _isActionableNode(obj) {
        return obj && (
            obj.players || 
            obj.weapon || 
            obj.camera || 
            obj.touch_delta || 
            obj.input_drag || 
            obj.bullet_events || 
            obj.damage_report || 
            obj.match_state
        );
    }

    // 2. HÀM TRUY XUẤT ĐỊA CHỈ (Đi thẳng vào điểm đích đã lưu)
    _getNodeByPath(obj, pathArray) {
        let current = obj;
        for (let i = 0; i < pathArray.length; i++) {
            if (current[pathArray[i]] === undefined || current[pathArray[i]] === null) return null;
            current = current[pathArray[i]];
        }
        return current;
    }

    // 3. HÀM DÒ MÌN DFS (Chỉ chạy 1 lần duy nhất khi mất dấu)
    _discoverPath(obj, currentPath = [], depth = 0) {
        if (depth > 4 || !obj || typeof obj !== 'object') return null; // Tránh tràn RAM
        if (this._isActionableNode(obj)) return currentPath;

        const rootKeys = ['data', 'events', 'payload', 'messages', 'vessels'];
        for (let i = 0; i < rootKeys.length; i++) {
            let key = rootKeys[i];
            if (obj[key]) {
                if (Array.isArray(obj[key])) {
                    for (let j = 0; j < obj[key].length; j++) {
                        let found = this._discoverPath(obj[key][j], [...currentPath, key, j], depth + 1);
                        if (found) return found;
                    }
                } else if (typeof obj[key] === 'object') {
                    let found = this._discoverPath(obj[key], [...currentPath, key], depth + 1);
                    if (found) return found;
                }
            }
        }
        return null;
    }

    // 4. LUỒNG THỰC THI CHÍNH (Xử lý 60 lần/giây)
    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        let targetNode = null;

        // [A] FAST-PATH: Thử đi theo con đường tắt đã ghi nhớ từ ván trước
        if (this.cachedPath) {
            let node = this._getNodeByPath(payload, this.cachedPath);
            if (node && this._isActionableNode(node)) {
                targetNode = node; // Đi tắt thành công!
            } else {
                this.cachedPath = null; // Cấu trúc bị đổi, reset trí nhớ
            }
        }

        // [B] DISCOVERY MODE: Nếu chưa nhớ đường, buộc phải cử trinh sát đi dò
        if (!targetNode) {
            if (this._isActionableNode(payload)) {
                this.cachedPath = []; // Dữ liệu nằm ngay ngoài cửa
                targetNode = payload;
            } else {
                let newPath = this._discoverPath(payload);
                if (newPath) {
                    this.cachedPath = newPath; // Lưu lại bản đồ cho các frame sau
                    targetNode = this._getNodeByPath(payload, newPath);
                }
            }
        }

        // Nếu quét nát mạng vẫn không thấy dữ liệu gì cần thiết, trả về nguyên trạng
        if (!targetNode) return payload;

        // ====================================================================
        // [C] DÂY CHUYỀN LẮP RÁP MỘT CHIỀU (ASSEMBLY LINE PIPELINE)
        // Dữ liệu tham chiếu (targetNode) được gọt giũa đi qua từng phân khu.
        // ====================================================================

        // [BƯỚC 0.5]: Dọn rác bộ nhớ, lọc nhiễu mạng NaN
        if (typeof MemoryAutoFlusher !== 'undefined') targetNode = MemoryAutoFlusher.execute(targetNode);

        // [BƯỚC 1]: Đọc lực tay, lọc EMA & Nhận diện ID súng
        if (typeof InputInterceptor !== 'undefined') targetNode = InputInterceptor.execute(targetNode);
        if (typeof WeaponAnalyzer !== 'undefined') targetNode = WeaponAnalyzer.execute(targetNode);
        
        // [BƯỚC 1.5]: Cách ly động học (Chống nở tâm do di chuyển)
        if (typeof SelfKinematicIsolator !== 'undefined') targetNode = SelfKinematicIsolator.execute(targetNode);

        // [BƯỚC 2]: Mắt thần 3D & Lọc bóng ma
        if (typeof TargetScanner2D3D !== 'undefined') targetNode = TargetScanner2D3D.execute(targetNode); 

        const weaponType = _vortex.__VortexState.weapon.type;
        
        if (weaponType !== "NONE") {
            // [BƯỚC 3]: Động cơ Lực đẩy Vector (Có Phanh ABS và Bơm Từ Tính)
            if (typeof VectorThrustEngine !== 'undefined') targetNode = VectorThrustEngine.execute(targetNode);

            // [BƯỚC 4]: Điều hướng Lõi Vũ Khí chuyên biệt (Trị liệu độ nảy)
            if (weaponType === "SHOTGUN" && typeof ShotgunCore !== 'undefined') targetNode = ShotgunCore.execute(targetNode);
            else if (weaponType === "SMG" && typeof SMGCore !== 'undefined') targetNode = SMGCore.execute(targetNode);
            else if (weaponType === "AR" && typeof ARCore !== 'undefined') targetNode = ARCore.execute(targetNode);
            else if (weaponType === "MARKSMAN" && typeof MarksmanCore !== 'undefined') targetNode = MarksmanCore.execute(targetNode); 

            // [BƯỚC 5]: Đạn Ma Thuật, Bẻ tia đạn & Sát thương ảo Phantom
            if (typeof BallisticsSynchronizer !== 'undefined') targetNode = BallisticsSynchronizer.execute(targetNode);
        }

        // Vì targetNode là một con trỏ tham chiếu (reference) tới payload gốc,
        // mọi thao tác cắt gọt ở trên đã được áp dụng thẳng vào hệ thống game. 
        // Chỉ việc trả về nguyên gốc payload.
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

// ============================================================================
// LỚP 6: DEEP DATA HIJACKER V7.11 (MẠNG LƯỚI BẮT CÓC & QUÉT DỮ LIỆU SÂU TỐI ƯU)
// Cập nhật: Tích hợp Time-Slicing Crawler (Băm nhỏ thời gian) chống đơ game.
// Cập nhật: WeakSet Protection chống tràn bộ nhớ do tham chiếu vòng.
// ============================================================================
class DeepDataHijacker {
    static initialize() {
        const _vortex = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        
        // Chốt chặn an toàn: Ngăn chặn việc tiêm đúp (Double Inject) gây crash game
        if (_vortex.__HijackerInitialized) return;
        _vortex.__HijackerInitialized = true;

        // --------------------------------------------------------------------
        // 1. CƯỚP QUYỀN WEBSOCKET (Nghe lén kết nối mạng thời gian thực)
        // --------------------------------------------------------------------
        const OrigWebSocket = window.WebSocket;
        if (OrigWebSocket) {
            window.WebSocket = function(url, protocols) {
                const ws = new OrigWebSocket(url, protocols);
                
                ws.addEventListener('message', function(event) {
                    try {
                        if (event.data && typeof event.data === 'string') {
                            // Bộ lọc Regex siêu tốc (Chỉ parse JSON nếu thấy từ khóa)
                            if (event.data.includes("pos") || event.data.includes("players") || 
                                event.data.includes("enemy") || event.data.includes("hp")) {
                                
                                let secretData = JSON.parse(event.data);
                                if (secretData && _vortex.__VORTEX_ENGINE) {
                                    // Đẩy dữ liệu mật vào đường ống siêu tốc
                                    _vortex.__VORTEX_ENGINE.processPayload(secretData);
                                }
                            }
                        }
                    } catch (e) {
                        // Im lặng bỏ qua lỗi parse JSON để giữ luồng mượt mà
                    }
                });
                return ws;
            };
        }

        // --------------------------------------------------------------------
        // 2. CƯỚP QUYỀN NATIVE-TO-JS (Nghe lén lõi C++ iOS gửi xuống UI)
        // --------------------------------------------------------------------
        const originalPostMessage = window.postMessage;
        window.postMessage = function(message, targetOrigin, transfer) {
            try {
                if (message && typeof message === 'object') {
                    // Bắt cóc gói tin chứa Entity List
                    if (message.players || message.enemy_list || message.hitboxes || message.entities) {
                        if (_vortex.__VORTEX_ENGINE) {
                            _vortex.__VORTEX_ENGINE.processPayload(message);
                        }
                    }
                }
            } catch (e) {}
            // Trả lại luồng chạy cho UI Game
            return originalPostMessage.apply(this, arguments);
        };

        // --------------------------------------------------------------------
        // 3. CƯỚP QUYỀN JS-TO-NATIVE (Trói cầu nối WKWebView MessageHandlers)
        // --------------------------------------------------------------------
        if (window.webkit && window.webkit.messageHandlers) {
            for (let handlerName in window.webkit.messageHandlers) {
                if (Object.prototype.hasOwnProperty.call(window.webkit.messageHandlers, handlerName)) {
                    let handler = window.webkit.messageHandlers[handlerName];
                    let origPostMessage = handler.postMessage;
                    
                    handler.postMessage = function(msg) {
                        return origPostMessage.apply(this, arguments);
                    };
                }
            }
        }

        // --------------------------------------------------------------------
        // 4. MẠNG NHỆN DÒ QUÉT BỘ NHỚ (ASYNC TIME-SLICING SPIDER)
        // Đào sâu vào RAM tìm dữ liệu ẩn mà không làm rớt dù chỉ 1 khung hình
        // --------------------------------------------------------------------
        setTimeout(() => {
            const keywords = ['player', 'enemy', 'entities', 'actors', 'combatants'];
            const MAX_DEPTH = 3; 
            const CHUNK_SIZE = 150; // Giới hạn quét 150 đối tượng mỗi khung hình

            // Khởi tạo hàng đợi BFS (Duyệt theo chiều rộng)
            let queue = [{ obj: window, depth: 0, path: "window" }];
            
            // Dùng WeakSet để nhớ các vùng RAM đã quét (Chống kẹt vòng lặp vô tận)
            let visitedMemory = new WeakSet(); 
            visitedMemory.add(window);

            function processMemoryChunk() {
                let processedCount = 0;

                // Xử lý 1 cục nhỏ (150 objects)
                while (queue.length > 0 && processedCount < CHUNK_SIZE) {
                    let current = queue.shift();
                    let obj = current.obj;
                    let depth = current.depth;
                    let path = current.path;

                    processedCount++;

                    // Dừng đào nếu đã quá sâu
                    if (depth > MAX_DEPTH) continue;

                    try {
                        let keys = Object.keys(obj);
                        for (let i = 0; i < keys.length; i++) {
                            let key = keys[i];
                            let childObj = obj[key];

                            if (childObj && typeof childObj === 'object') {
                                let keyLower = key.toLowerCase();
                                
                                // Nhận diện mảng chứa thực thể (Kho báu 3D)
                                if (keywords.some(kw => keyLower.includes(kw)) && Array.isArray(childObj) && childObj.length > 0) {
                                    _vortex.__HiddenEntitiesList = childObj; 
                                }

                                // Nếu vùng nhớ này chưa được quét, đưa vào hàng đợi
                                if (!visitedMemory.has(childObj)) {
                                    visitedMemory.add(childObj);
                                    queue.push({ obj: childObj, depth: depth + 1, path: path + "." + key });
                                }
                            }
                        }
                    } catch (e) {
                        // Bỏ qua vùng nhớ bị khóa quyền CORS/Private (DOM Exception)
                    }
                }

                // Kiểm tra tiến độ
                if (queue.length > 0) {
                    // Nếu còn đồ để quét -> Đi ngủ 16ms nhường CPU cho Game render ảnh, sau đó gọi lại
                    setTimeout(processMemoryChunk, 16); 
                } else {
                    // Quét xong toàn bộ bản đồ RAM -> Giải phóng bộ nhớ (Garbage Collection)
                    visitedMemory = null; 
                }
            }

            // Kích hoạt con nhện
            processMemoryChunk();

        }, 3500); // Trì hoãn 3.5s chờ game load xong Model 3D
    }
}

// Khởi động Hệ thống Bắt cóc ngay lập tức khi tiêm mã
DeepDataHijacker.initialize();
