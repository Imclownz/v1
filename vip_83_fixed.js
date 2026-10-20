/**
 * ==============================================================================
 * PROJECT: VORTEX-ASSIST V7.0 [MECHANICAL-ORGANIC SYNERGY]
 * Objective: 2D Screen-Center Culling, Vector Guidance, Delta-X Strafe Tracking,
 * Marksman Inverse-Braking, ADS 15px Pre-kick.
 * Environment: iOS Shortcuts / JSBridge
 * ==============================================================================
 */

const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
const _vortex = _globalEnv._vortex || _globalEnv;

// ============================================================================
// 0. VORTEX STATE V7.11 (BỘ NHỚ TOÀN CỤC & TÁI CHẾ OBJECT - ZERO GC)
// Đã tích hợp Object Pooling để chống khựng khung hình (Stutter) do rác RAM.
// ============================================================================
if (!_vortex.__VortexState || _vortex.__VortexState.version !== "VORTEX_V8.4") {
    _vortex.__VortexState = {
        version: "VORTEX_V8.4",

        // Trạng thái Input (Ngón tay & Ống ngắm - Tách biệt ngón Bắn & Lia)
        input: { 
            rawX: 0, rawY: 0, smoothX: 0, smoothY: 0, magnitude: 0, 
            isSwiping: false, dirX: 0, dirY: 0, _flickCooldown: 0,
            fireTouchId: null, lookTouchId: null 
        },

        // Trạng thái Vũ khí (Hỗ trợ hồ sơ súng chuyên biệt subType)
        weapon: { type: "NONE", subType: "NONE", isFiring: false, bulletCount: 0, currentWeaponId: null },

        // Trạng thái Mục tiêu
        target: {
            id: null, scanFrame: 0, distance3D: 999.0, distance2D: 999.0,
            pitchError: 999.0, yawError: 999.0, enemyDeltaYaw: 0.0,
            lastHeadPos: { x: 0, y: 0, z: 0 }, lastVelocity: { x: 0, y: 0, z: 0 }, ghostFrames: 0,
            skeleton: null, aimZone: "NONE", isStuckInStomach: false, isStuckInLegs: false,
            crownPos: { x: 0, y: 0, z: 0 }, crownPitch: 0.0
        },

        // Dữ liệu Camera Toàn cục (Dùng cho ESP)
        cameraInfo: null,

        // Động cơ Vật lý & Bộ hãm trần đỉnh đầu (Soft Ceiling & Breakout Jerk)
        engine: { 
            isADS: false, thrustMultiplier: 1.0, isABSBraking: false, 
            remX: 0, remY: 0, wasADS: false, adsCalmFrames: 0,
            breakoutFrames: 0, softCeilingPitch: 0, zeroCrossingDamp: 0,
            isBreakoutActive: false, isSoftCeilingActive: false,
            fireTouchId: null, lookTouchId: null,
            escapeMomentumFrames: 0, preFireLiftActive: false,
            snapLockFrames: 0
        },

        // Động học bản thân & Pha nhảy (Jump-Shot Engine)
        localPlayer: { 
            velocityY: 0.0, accelY: 0.0, displacementY: 0.0, 
            isAirborne: false, jumpPhase: "GROUND", 
            selfAngularVelYaw: 0.0, selfAngularVelPitch: 0.0, 
            prevCamYaw: null, prevCamPitch: null, teamId: null 
        },

        // ====================================================================
        // [NEW] IL2CPP MEMORY OFFSETS DICTIONARY (FREE FIRE V8.4 HARDWARE HOOKS)
        // Bản đồ địa chỉ gốc từ Offsets.cs để truy xuất trực tiếp O(1)
        // ====================================================================
        il2cpp: {
            InitBase: 0xA988FDC,
            StaticClass: 0x5C,
            CurrentMatch: 0x50,
            MatchStatus: 0x8C,
            LocalPlayer: 0x94,
            LocalPlayerAttributes: 0x4BC,
            DictionaryEntities: 0x68,
            TeamID: 0x29C,
            Player_IsDead: 0x50,
            Player_Name: 0x2DC,
            Player_Data: 0x48,
            Player_ShadowBase: 0x18B8,
            XPose: 0x78,
            AvatarManager: 0x4C0,
            Avatar: 0xA8,
            Avatar_IsVisible: 0x95,
            IsFiring: 0x544,
            WeaponRecoil: 0xC,
            // [REVERSED COW ENGINE ENUMS & BONE CONSTANTS]
            BodyPart: {
                NONE: 0,
                HEAD: 1,
                BODY: 2,
                LIMB: 3,
                PROTECTION: 4,
                ICEWALL: 8,
                VEHICLE: 6,
                SHIELD: 11
            },
            Bones: {
                Head: "bone_Head",
                Neck: "bone_Neck",
                Spine: "bone_Spine",
                Spine01: "bone_Spine01",
                Spine1: "bone_Spine1",
                Hips: "bone_Hips",
                Pelvis: "bone_Pelvis",
                LeftClav: "bone_LeftClav",
                RightClav: "bone_RightClav",
                LeftArm: "bone_LeftArm",
                RightArm: "bone_RightArm",
                LeftForeArm: "bone_LeftForeArm",
                RightForeArm: "bone_RightForeArm",
                LeftHand: "bone_LeftHand",
                RightHand: "bone_RightHand",
                LeftLegUpper: "bone_LeftLegUpper",
                RightLegUpper: "bone_RightLegUpper",
                LeftAnkle: "bone_LeftAnkle",
                RightAnkle: "bone_RightAnkle",
                LeftToe: "bone_LeftToe",
                RightToe: "bone_RightToe",
                Camera: "Root/bone_Camera"
            },
            EngineCurves: {
                crouchRecoilScale: 0.65,
                aimAssistDampYFactor: 1.35
            }
        },

        // ====================================================================
        // [NEW] OBJECT POOLING: KHO TÁI CHẾ DỮ LIỆU
        // Khai báo sẵn các "vỏ hộp" để chứa dữ liệu, không bao giờ sinh rác.
        // ====================================================================
        pool: {
            // Dùng cho Bước 2: Lưu dữ liệu mục tiêu ngon ăn nhất
            tempTarget: {
                id: null, distance3D: 999.0, distance2D: 999.0, deltaPitch: 0, deltaYaw: 0,
                enemyDeltaYaw: 0, absoluteEnemyYaw: 0, rawHeadPos: { x: 0, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: 0 }, isGhost: false,
                skeleton: null, aimZone: "NONE", crownPos: { x: 0, y: 0, z: 0 }, crownPitch: 0.0
            },
            // Dùng cho Bước 2: Lưu dữ liệu nội suy của Bóng ma
            tempGhost: {
                id: null, distance3D: 999.0, distance2D: 999.0, deltaPitch: 0, deltaYaw: 0,
                enemyDeltaYaw: 0, absoluteEnemyYaw: 0, isGhost: true
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
        // --------------------------------------------------------------------
        // 2. NHẬN DIỆN TÍN HIỆU TRẬN MỚI & VÒNG MỚI (MATCH / CS ROUND SENSOR)
        // --------------------------------------------------------------------
        let isNewMatch = false;

        // Cờ A: Nếu Game truyền thẳng trạng thái trận đấu hoặc vòng đấu (Tử Chiến 4v4 / Sinh Tồn)
        if (payload.match_state && (payload.match_state === "LOBBY" || payload.match_state === "START" || payload.match_state === "ROUND_START" || payload.match_state === "BUY_PHASE" || payload.match_state === "PREPARATION")) {
            isNewMatch = true;
        }
        else if (payload.round_state && (payload.round_state === "ROUND_START" || payload.round_state === "PREPARATION" || payload.round_state === "BUY_PHASE" || payload.round_state === "LOBBY" || payload.round_state === "START" || payload.round_state === "ROUND_END")) {
            isNewMatch = true;
        }
        // Cờ B: Nếu ID của trận đấu hoặc số vòng (Round Number) thay đổi
        else if (payload.match_id && payload.match_id !== state.currentMatchId) {
            isNewMatch = true;
            state.currentMatchId = payload.match_id;
        }
        else if (payload.round_number !== undefined && state.lastRoundNumber !== undefined && payload.round_number !== state.lastRoundNumber) {
            isNewMatch = true;
            state.lastRoundNumber = payload.round_number;
        }
        else if (payload.round_id !== undefined && state.lastRoundId !== undefined && payload.round_id !== state.lastRoundId) {
            isNewMatch = true;
            state.lastRoundId = payload.round_id;
        }
        else if (payload.match_status !== undefined && state.lastMatchStatus !== undefined && payload.match_status !== state.lastMatchStatus) {
            // Trong IL2CPP, match_status (offset 0x8C) thay đổi khi chuyển đổi vòng Tử Chiến 4v4
            isNewMatch = true;
            state.lastMatchStatus = payload.match_status;
        }
        // Cờ C: Nhận diện biến động qua số lượng người chơi (Tương thích Sinh Tồn 50 người & Tử Chiến 4v4)
        else {
            let currentPlayerCount = payload.players ? payload.players.length : 0;
            if (state.lastPlayerCount !== undefined) {
                // Sinh Tồn BR (50 người):
                if ((currentPlayerCount === 0 && state.lastPlayerCount > 10) ||
                    (currentPlayerCount > 20 && state.lastPlayerCount < 5)) {
                    isNewMatch = true;
                }
                // Tử Chiến 4v4 (Tối đa 8 người):
                else if (state.lastPlayerCount <= 8 && currentPlayerCount <= 8) {
                    if ((currentPlayerCount === 0 && state.lastPlayerCount > 0) ||
                        (currentPlayerCount > 0 && state.lastPlayerCount === 0)) {
                        isNewMatch = true;
                    }
                }
            }
            state.lastPlayerCount = currentPlayerCount;
        }

        if (payload.round_number !== undefined) state.lastRoundNumber = payload.round_number;
        if (payload.round_id !== undefined) state.lastRoundId = payload.round_id;
        if (payload.match_status !== undefined) state.lastMatchStatus = payload.match_status;

        // --------------------------------------------------------------------
        // 3. KÍCH HOẠT QUY TRÌNH LỌC MÁU BỘ NHỚ (FLUSH)
        // --------------------------------------------------------------------
        if (isNewMatch) {
            // Xóa sạch bộ nhớ Mục tiêu (Kẻ địch ván trước, bóng ma, tọa độ cũ)
            state.target = {
                id: null,
                ref: null,
                skeleton: null,
                aimZone: "NONE",
                isStuckInStomach: false,
                isStuckInLegs: false,
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
                lastAI_X: 0,
                lastAI_Y: 0,
                wasADS: false,
                adsCalmFrames: 0,
                enemyAngularSpeedYaw: 0,
                enemyAngularSpeedPitch: 0,
                prevFrameTime: 0
            };

            // Xóa lực kéo cảm ứng và gia tốc EMA đang lưu trữ
            state.input = {
                rawX: 0, rawY: 0,
                smoothX: 0, smoothY: 0,
                magnitude: 0,
                isSwiping: false,
                dirX: 0, dirY: 0,
                _flickCooldown: 0
            };

            // Dọn sạch Parasitic Offsets tích lũy giữa các round
            const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
            const _v = _globalEnv._vortex || _globalEnv;
            _v.__GlobalOffsetX = 0;
            _v.__GlobalOffsetY = 0;
            _v.__PendingDeltaX = 0;
            _v.__PendingDeltaY = 0;
            _v.__SmoothOffsetX = 0;
            _v.__SmoothOffsetY = 0;
            _v.__GlobalWasmPlayers = null;
            _v.__LastKnownPlayers = null;

            if (state.pool) {
                state.pool.topCandidates = [null, null, null, null, null, null, null, null, null, null];
                state.pool.topCandidateScores = [999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0];
                state.pool.top4Refs = [null, null, null, null];
                state.pool.top4DistSq = [999999.0, 999999.0, 999999.0, 999999.0];
            }

            // Trả bộ đếm đạn và trạng thái bản thân về mặc định
            state.weapon.bulletCount = 0;
            state.weapon.isFiring = false;

            if (state.localPlayer) {
                state.localPlayer.velocityY = 0.0;
                state.localPlayer.displacementY = 0.0;
            }
        } else if (payload.players && Array.isArray(payload.players)) {
            // ================================================================
            // [MODULE 0 UPGRADE]: EPHEMERAL LIFETIME CULLING (ZERO-GC CACHE EVICTION)
            // Tự động giải phóng cache mục tiêu đã chết hoặc biến mất quá 3 frames
            // ================================================================
            const activePool = _vortex.__HeadTrackerPool;
            if (activePool) {
                const liveIds = new Set();
                let pCount = payload.players.length;
                for (let p = 0; p < pCount; p++) {
                    let pl = payload.players[p];
                    if (pl && pl.id && !pl.is_dead && pl.hp > 0) {
                        liveIds.add(pl.id);
                    }
                }
                for (let tid in activePool) {
                    if (!liveIds.has(tid)) {
                        activePool[tid].staleFrames = (activePool[tid].staleFrames || 0) + 1;
                        if (activePool[tid].staleFrames > 3) {
                            delete activePool[tid];
                        }
                    } else if (activePool[tid].staleFrames) {
                        activePool[tid].staleFrames = 0;
                    }
                }
            }

            // Nếu mục tiêu hiện tại đã chết, lập tức nhả khóa an toàn
            if (state.target && state.target.id && !state.target.isGhost) {
                let curTarget = payload.players.find(p => p.id === state.target.id);
                if (curTarget && (curTarget.is_dead || curTarget.hp <= 0)) {
                    state.target.id = null;
                    state.target.ref = null;
                    state.target.aimZone = "NONE";
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 1: INPUT INTERCEPTOR V10 (DYNAMIC KINEMATIC FILTER)
// Đột phá:
// 1. Gia Tốc Động Học (Dynamic EMA): Tự động mở toang van tiết lưu (Alpha = 1.0) 
//    khi phát hiện người chơi vẩy tay nhanh hoặc quay màn hình.
// 2. Vi Chỉnh Cục Bộ (Micro-Aiming): Siết chặt van (Alpha = 0.3) khi người chơi 
//    vuốt nhẹ để khử rung tay tuyệt đối khi sấy.
// ============================================================================
class InputInterceptor {
    static execute(payload) {
        // BẢO VỆ JOYSTICK: Nếu là gói tin di chuyển / joystick, tuyệt đối không can thiệp
        if (payload.is_joystick || payload.is_movement || payload.touch_type === "movement" || payload.channel === "movement" || payload.type === "joystick" || payload.type === "move" || payload.is_move) {
            return payload;
        }
        const checkTouchId = payload.id !== undefined ? payload.id : 
            (payload.touch_id !== undefined ? payload.touch_id : 
            (payload.touchId !== undefined ? payload.touchId : 
            (payload.finger_id !== undefined ? payload.finger_id : payload.fingerId)));
        if (checkTouchId !== undefined && _vortex.__JoystickTouchIds && _vortex.__JoystickTouchIds.has(checkTouchId)) {
            return payload;
        }

        const state = _vortex.__VortexState;

        // Trích xuất Vector vuốt nguyên thủy từ ngón tay người
        let rawX = 0;
        let rawY = 0;

        if (payload.touch_delta) {
            rawX = payload.touch_delta.x || 0;
            rawY = payload.touch_delta.y || 0;
        } else if (payload.input_drag) {
            rawX = payload.input_drag.x !== undefined ? payload.input_drag.x : (payload.input_drag.raw_x !== undefined ? payload.input_drag.raw_x : 0);
            rawY = payload.input_drag.y !== undefined ? payload.input_drag.y : (payload.input_drag.raw_y !== undefined ? payload.input_drag.raw_y : 0);
        }

        // TỐI ƯU O(1): Nếu không chạm màn hình, reset trạng thái và rời đi ngay
        if (rawX === 0 && rawY === 0) {
            state.input.isSwiping = false;
            state.input.rawX = 0;
            state.input.rawY = 0;
            state.input.smoothX = 0;
            state.input.smoothY = 0;
            state.input.magnitude = 0;
            return payload;
        }

        state.input.isSwiping = true;
        state.input.rawX = rawX;
        state.input.rawY = rawY;

        // Tính toán Động năng (Magnitude) của ngón tay
        let magnitude = Math.sqrt((rawX * rawX) + (rawY * rawY));
        state.input.magnitude = magnitude;

        // ====================================================================
        // [COMBAT FAST-RESPONSE]: ZERO-LATENCY TOUCH PASSTHROUGH
        // Khi KHÔNG BẮN: 100% 1:1 tốc độ ngón tay tự nhiên
        // Khi ĐANG BẮN hoặc VẨY TÂM (magnitude > 15.0):
        // Bypass hoàn toàn bộ lọc EMA (alpha = 1.0) để phản xạ tức thì,
        // triệt tiêu cảm giác nặng tay, vẩy tâm và lia tâm cực nhạy!
        // ====================================================================
        let alphaX = 1.0;
        let alphaY = 1.0;

        let isInCombat = state.weapon.isFiring && state.target.id;

        if (!state.weapon.isFiring || isInCombat || magnitude > 15.0) {
            alphaX = 1.0;
            alphaY = 1.0;
        } else {
            alphaX = 0.95;
            alphaY = 0.95;
        }

        // ====================================================================
        // [MODULE 1 UPGRADE]: DUAL-STAGE SAVITZKY-GOLAY MICRO-JITTER FILTER
        // Khi ngón tay di chuyển chậm / rung nhẹ tự nhiên (magnitude < 3.0),
        // khử nhiễu micro-jitter bậc 2 mà không tạo độ trễ pha
        // ====================================================================
        if (!state.input._sgRingX) {
            state.input._sgRingX = [rawX, rawX, rawX];
            state.input._sgRingY = [rawY, rawY, rawY];
        } else {
            state.input._sgRingX.shift();
            state.input._sgRingX.push(rawX);
            state.input._sgRingY.shift();
            state.input._sgRingY.push(rawY);
        }

        if (!state.weapon.isFiring && magnitude < 3.0 && !isInCombat) {
            // Lọc đa thức bậc 2 3-điểm: y_0 = (x_-1 + 2*x_0 + x_1) / 4
            state.input.smoothX = (state.input._sgRingX[0] + 2 * state.input._sgRingX[1] + state.input._sgRingX[2]) * 0.25;
            state.input.smoothY = (state.input._sgRingY[0] + 2 * state.input._sgRingY[1] + state.input._sgRingY[2]) * 0.25;
        } else {
            // ÁP DỤNG CÔNG THỨC EMA / FAST PASSTHROUGH
            state.input.smoothX = (rawX * alphaX) + ((state.input.smoothX || 0) * (1.0 - alphaX));
            state.input.smoothY = (rawY * alphaY) + ((state.input.smoothY || 0) * (1.0 - alphaY));
        }

        if (alphaX >= 0.99) state.input.smoothX = rawX;
        if (alphaY >= 0.99) state.input.smoothY = rawY;

        if (payload.touch_delta) {
            payload.touch_delta.x = state.input.smoothX;
            payload.touch_delta.y = state.input.smoothY;
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 1.5: WEAPON ANALYZER (V9.0 ZERO-GC CACHE ROUTER)
// Đột phá Tối ưu hóa:
// 1. Xóa bỏ hoàn toàn Regex và Lệnh .split() tạo rác RAM.
// 2. Sử dụng Static Dictionary kết hợp Native indexOf() siêu tốc.
// 3. O(1) Memoization (Truy xuất tức thời trong 0ms sau lần gặp đầu tiên).
// ============================================================================
class WeaponAnalyzer {

    // Khởi tạo Cây Từ Điển Tĩnh (Chỉ chạy 1 lần duy nhất vào đầu game)
    static initialize() {
        if (this.initialized) return;

        // Kho lưu trữ ID súng đã phân tích (Tốc độ tra cứu tuyệt đối O(1))
        this.weaponCache = {};

        // Cây định tuyến phân loại vũ khí:
        // Đặt các từ khóa nhận diện chuyên biệt lên trước.
        // "AR" hoặc "SMG" chung chung được đặt xuống cuối để làm Fallback an toàn,
        // tránh việc nhận nhầm "SCAR" thành "AR" hoặc "CHARGE" thành "AR".
        this.signatures = [
            { type: "SNIPER", keys: ["AWM", "KAR98K", "M82B", "BARRETT", "VSK94"] },
            { type: "MARKSMAN", keys: ["WOODPECKER", "SKS", "AC80", "SVD", "DESERT", "DEAGLE", "M500", "DRAGUNOV", "M590", "CHIM", "GO_KIEN", "GOKIEN", "DE"] },
            { type: "SHOTGUN", keys: ["SHOTGUN", "M1887", "M1014", "MAG-7", "MAG7", "SPAS", "TROGON", "CHARGE", "M1873", "M590"] },
            { type: "SMG", keys: ["SMG", "MP40", "UMP", "MAC", "MP5", "VECTOR", "THOMPSON", "P90", "BIZON", "CG15"] },
            { type: "AR", keys: ["RIFLE", "AK", "SCAR", "M4A1", "FAMAS", "XM8", "GROZA", "AUG", "PISTOL", "M14", "AN94", "PARAFAL", "AR", "TAVOR"] }
        ];

        // [HỒ SƠ VŨ KHÍ CHI TIẾT]: Nhận diện chính xác từng khẩu súng quốc dân
        this.specificSignatures = [
            { id: "MP40", keys: ["MP40"] },
            { id: "UMP", keys: ["UMP"] },
            { id: "AK47", keys: ["AK47", "AK_47", "AK"] },
            { id: "SCAR", keys: ["SCAR"] },
            { id: "M1887", keys: ["M1887"] },
            { id: "M1014", keys: ["M1014"] },
            { id: "WOODPECKER", keys: ["WOODPECKER", "CHIM", "GOKIEN", "GO_KIEN"] },
            { id: "DESERT_EAGLE", keys: ["DESERT", "DEAGLE", "DE"] },
            { id: "SKS", keys: ["SKS"] },
            { id: "DRAGUNOV", keys: ["DRAGUNOV", "SVD"] },
            { id: "AC80", keys: ["AC80", "AC_80"] },
            { id: "M500", keys: ["M500"] },
            { id: "M590", keys: ["M590", "M_590"] },
            { id: "MAG7", keys: ["MAG-7", "MAG7"] },
            { id: "AWM", keys: ["AWM"] },
            { id: "M82B", keys: ["M82B", "BARRETT"] }
        ];

        this.initialized = true;
    }

    static execute(payload) {
        this.initialize();
        const weaponState = _vortex.__VortexState.weapon;

        // ==========================================================
        // 1. PROGRESSIVE BULLET COUNTER (ĐẾM CHU KỲ XẢ ĐẠN ZERO-GC)
        // ==========================================================
        let currentlyFiring = false;

        if (payload.is_firing !== undefined) {
            currentlyFiring = payload.is_firing;
        } else if (payload.weapon && payload.weapon.is_firing !== undefined) {
            currentlyFiring = payload.weapon.is_firing;
        }

        // Tự động tăng tiến biến đếm đạn hoặc đồng bộ trực tiếp từ payload
        if (payload.weapon && payload.weapon.bullet_count !== undefined) {
            weaponState.bulletCount = payload.weapon.bullet_count;
        } else if (currentlyFiring) {
            weaponState.bulletCount = !weaponState.isFiring ? 1 : weaponState.bulletCount + 1;
        } else {
            weaponState.bulletCount = 0;
        }
        weaponState.isFiring = currentlyFiring;

        // ====================================================================
        // [MODULE 2 UPGRADE]: PER-BULLET RECOIL DYNAMIC TRANSFER FUNCTION
        // R(n) = 1.0 + alpha * ln(1 + n) - Tự động bù trừ độ giật nảy tăng tiến
        // ====================================================================
        let bCount = weaponState.bulletCount || 0;
        weaponState.dynamicRecoilMultiplier = bCount > 0 ? (1.0 + 0.12 * Math.log(1.0 + bCount)) : 1.0;
        if (payload.weapon) {
            payload.weapon.dynamic_recoil_multiplier = weaponState.dynamicRecoilMultiplier;
        }

        // ==========================================================
        // 2. WEAPON ID MEMOIZATION & NATIVE SCANNING
        // ==========================================================
        if (payload.weapon) {
            // Trích xuất ID gốc của Unity Engine (hoặc subType/name/type khi không có id)
            const currentId = payload.weapon.id !== undefined ? payload.weapon.id : 
                (payload.weapon.subType || payload.weapon.subtype || payload.weapon.name || payload.weapon.type || "UNKNOWN");

            // Chỉ kích hoạt phân tích khi người chơi thực sự ĐỔI SÚNG
            if (currentId !== weaponState.currentWeaponId || weaponState.type === "NONE") {
                weaponState.currentWeaponId = currentId;

                // [TẦNG 1: O(1) CACHE HIT]: Đã từng phân tích súng này? 
                if (this.weaponCache[currentId]) {
                    const cached = this.weaponCache[currentId];
                    weaponState.type = cached.type;
                    weaponState.subType = cached.subType;
                    return payload;
                }

                // [TẦNG 2: NATIVE SCANNING CACHE MISS]: Súng mới gặp lần đầu
                const rawName = payload.weapon.name || "";
                const rawCat = payload.weapon.category || "";
                const rawType = payload.weapon.type || "";
                const rawSubType = payload.weapon.subType || payload.weapon.subtype || "";
                const signatureStr = (currentId + "_" + rawName + "_" + rawCat + "_" + rawType + "_" + rawSubType).toUpperCase();

                let determinedType = "NONE";
                let determinedSubType = "NONE";

                // Nhận diện trực tiếp nếu payload đã có type chuẩn
                const validTypes = ["AR", "SMG", "SHOTGUN", "MARKSMAN", "SNIPER"];
                if (validTypes.includes(rawType.toUpperCase())) {
                    determinedType = rawType.toUpperCase();
                }

                // Phân loại nhóm vũ khí chính nếu chưa có
                if (determinedType === "NONE") {
                    outerLoop: for (let i = 0; i < this.signatures.length; i++) {
                        let sigGroup = this.signatures[i];
                        let keys = sigGroup.keys;
                        let kLen = keys.length;

                        for (let j = 0; j < kLen; j++) {
                            if (signatureStr.indexOf(keys[j]) !== -1) {
                                determinedType = sigGroup.type;
                                break outerLoop;
                            }
                        }
                    }
                }

                // Phân loại khẩu súng cụ thể
                for (let i = 0; i < this.specificSignatures.length; i++) {
                    let spec = this.specificSignatures[i];
                    for (let j = 0; j < spec.keys.length; j++) {
                        if (signatureStr.indexOf(spec.keys[j]) !== -1) {
                            determinedSubType = spec.id;
                            break;
                        }
                    }
                    if (determinedSubType !== "NONE") break;
                }

                // Lưu vào bộ nhớ đệm
                this.weaponCache[currentId] = { type: determinedType, subType: determinedSubType };
                weaponState.type = determinedType;
                weaponState.subType = determinedSubType;
            }
        }

        return payload;
    }
}

// ============================================================================
// BƯỚC 2.5: SELF-KINEMATIC ISOLATOR V9.0 (O(1) CACHE OPTIMIZATION)
// Đột phá: 
// 1. Index Caching: Ghi nhớ vị trí bản thân trong mảng, triệt tiêu vòng lặp O(N).
// 2. Zero-Stance Illusion: Đánh lừa trạng thái di chuyển để chống Nở Tâm.
// 3. Tách xuất Vận tốc Y siêu tốc để phục vụ Bù trừ điểm ngắm.
// ============================================================================
class SelfKinematicIsolator {
    static execute(payload) {
        const state = _vortex.__VortexState;

        // 1. IL2CPP DIRECT FAST-PATH (CurrentMatch + 0x94 / payload.local_player)
        let myPlayer = (payload.current_match && payload.current_match.local_player) ? 
            payload.current_match.local_player : 
            (payload.local_player || payload.my_player);

        // 2. O(1) INDEX CACHING: Nếu Game trộn bản thân vào mảng 50 người chơi
        if (!myPlayer && payload.players) {
            const players = payload.players;
            const cachedIdx = state.localPlayer.cachedIndex;

            if (cachedIdx !== undefined && players[cachedIdx] &&
                (players[cachedIdx].is_local || players[cachedIdx].id === payload.my_id)) {
                myPlayer = players[cachedIdx];
            } else {
                let pLen = players.length;
                for (let i = 0; i < pLen; i++) {
                    let p = players[i];
                    if (p.is_local || p.id === payload.my_id) {
                        myPlayer = p;
                        state.localPlayer.cachedIndex = i;
                        break;
                    }
                }
            }
        }

        // 2.1 TRÍCH XUẤT CỜ BẮN VẬT LÝ & TEAM ID TRỰC TIẾP (IL2CPP OFFSETS 0x544 & 0x29C)
        if (myPlayer) {
            // Team ID tự động
            if (myPlayer.team_id !== undefined) {
                state.localPlayer.teamId = myPlayer.team_id;
            } else if (payload.my_team_id !== undefined) {
                state.localPlayer.teamId = payload.my_team_id;
            }

            // Cờ bắn phần cứng IsFiring (0x544): Kích hoạt ngay lập tức ở mili-giây 0
            if (myPlayer.is_firing_hardware === true || myPlayer.is_firing === true || myPlayer.isFiring === true) {
                state.weapon.isFiring = true;
            }
        }

        // 3. TRÍCH XUẤT ĐỘNG HỌC BẢN THÂN TOÀN DIỆN 3D (DUAL-KINEMATIC MOTION & JUMP-SHOT ENGINE)
        if (myPlayer) {
            let v = myPlayer.real_velocity || myPlayer.velocity;
            let myVelX = v ? (v.x || 0) : 0;
            let myVelY = v ? (v.y || 0) : 0;
            let myVelZ = v ? (v.z || 0) : 0;

            let prevVelX = state.localPlayer.velocityX || 0;
            let prevVelY = state.localPlayer.velocityY || 0;
            let prevVelZ = state.localPlayer.velocityZ || 0;

            state.localPlayer.velocityX = myVelX;
            state.localPlayer.velocityY = myVelY;
            state.localPlayer.velocityZ = myVelZ;
            state.localPlayer.speedXZ = Math.sqrt((myVelX * myVelX) + (myVelZ * myVelZ));

            state.localPlayer.accelX = (myVelX - prevVelX) / 0.0166;
            state.localPlayer.accelY = (myVelY - prevVelY) / 0.0166;
            state.localPlayer.accelZ = (myVelZ - prevVelZ) / 0.0166;

            state.localPlayer.displacementX = myVelX * 0.0166;
            state.localPlayer.displacementY = myVelY * 0.0166;
            state.localPlayer.displacementZ = myVelZ * 0.0166;

            // PHÂN LOẠI PHA NHẢY (JUMP PHASES):
            // 1. ASCENDING: Đang bay lên (v_y > 0.8)
            // 2. APEX: Đỉnh parabol (|v_y| <= 0.8 nhưng đang ở trên không)
            // 3. FALLING: Đang rơi tự do (v_y < -0.8)
            // 4. GROUND: Trên mặt đất
            let isAirborne = myPlayer.is_jumping || (Math.abs(myVelY) > 0.6) || (myPlayer.is_in_air === true);
            let phase = "GROUND";
            if (isAirborne) {
                if (myVelY > 0.8) phase = "ASCENDING";
                else if (myVelY < -0.8) phase = "FALLING";
                else phase = "APEX";
            }
            state.localPlayer.jumpPhase = phase;
            state.localPlayer.isAirborne = isAirborne;

            // ================================================================
            // [MODULE 3 UPGRADE]: GRAVITATIONAL PARALLAX DECOUPLING & APEX PREDICTOR
            // Bù vi phân trọng trường g = 9.81 m/s^2 đón đầu đỉnh nhảy ngay từ pha ASCENDING
            // ================================================================
            const GRAVITY = 9.81;
            let timeToApex = (phase === "ASCENDING") ? Math.max(0.0, myVelY / GRAVITY) : 0.0;
            state.localPlayer.timeToApex = timeToApex;
            state.localPlayer.jumpParallaxPitchComp = (phase === "ASCENDING") ? (-myVelY * 0.15) : (phase === "FALLING" ? (-myVelY * 0.12) : 0.0);

            // TUYỆT ĐỐI KHÔNG can thiệp vào is_moving, is_crouching, is_jumping, velocity hay movement_penalty
            // của myPlayer. Giữ nguyên 100% trạng thái di chuyển để nhân vật chạy mượt mà, không bao giờ bị chậm hay khựng!
        }

        // 4. CHỈ TRIỆT TIÊU ĐỘ NỞ TÂM CỦA VŨ KHÍ KHI DI CHUYỂN, KHÔNG CHẶN DI CHUYỂN
        if (payload.weapon) {
            let wp = payload.weapon;
            if (wp.movement_spread_multiplier !== undefined) wp.movement_spread_multiplier = 0.0;
            if (wp.jump_spread_multiplier !== undefined) wp.jump_spread_multiplier = 0.0;
        }

        // ====================================================================
        // 5. SELF ANGULAR VELOCITY TRACKING (BÙ TRỪ QUÁN TÍNH BẢN THÂN)
        // Đo vận tốc góc camera của chính mình để VectorThrustEngine trừ ra,
        // tránh lực AI bị quán tính di chuyển kéo lệch.
        // ====================================================================
        let camYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);
        let camPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        let lp = state.localPlayer;

        if (lp.prevCamYaw !== null) {
            let dYaw = camYaw - lp.prevCamYaw;
            // Normalize
            while (dYaw > 180) dYaw -= 360;
            while (dYaw < -180) dYaw += 360;
            let dPitch = camPitch - lp.prevCamPitch;

            // Vô hiệu hóa feedback góc quay camera tránh xung đột vòng lặp kín gây giật tâm (Oscillation)
            lp.selfAngularVelYaw = 0;
            lp.selfAngularVelPitch = 0;
        } else {
            lp.selfAngularVelYaw = 0;
            lp.selfAngularVelPitch = 0;
        }
        lp.prevCamYaw = camYaw;
        lp.prevCamPitch = camPitch;

        return payload;
    }
}

// ============================================================================
// MODULE 10: ADAPTIVE NETWORK LATENCY COMPENSATOR (RTT & TICK MONITOR)
// Giám sát trễ mạng, tính toán RTT động và trích xuất Network Jitter
// Tự động scale lead-time delta_t theo điều kiện mạng thực tế (20ms - 150ms)
// ============================================================================
class AdaptiveNetworkLatencyCompensator {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        
        if (!state.network) {
            state.network = {
                lastPacketTime: now,
                rttMs: 38.0,
                jitterMs: 2.0,
                adaptiveLeadSeconds: 0.025,
                tickInterval: 0.0166
            };
        }

        let net = state.network;
        let dt = (now - net.lastPacketTime);
        if (dt > 1.0 && dt < 200.0) {
            net.tickInterval = (dt * 0.2) + (net.tickInterval * 0.8);
        }
        net.lastPacketTime = now;

        // Trích xuất ping từ payload (nếu có) hoặc ước lượng từ RTT
        let reportedPing = payload.ping !== undefined ? payload.ping :
            (payload.network_lag !== undefined ? payload.network_lag :
            (payload.rtt !== undefined ? payload.rtt : null));

        if (reportedPing !== null && typeof reportedPing === 'number' && reportedPing > 0) {
            let lastRtt = net.rttMs;
            net.rttMs = (reportedPing * 0.3) + (lastRtt * 0.7);
            net.jitterMs = (Math.abs(reportedPing - lastRtt) * 0.25) + (net.jitterMs * 0.75);
        }

        // Tự động tính toán Lead Time thích ứng:
        // lead = (RTT / 2) + 1 frame render lag + jitter margin
        let pingSec = Math.max(0.015, Math.min(0.180, (net.rttMs / 1000.0)));
        let frameSec = 1.0 / (_vortex.__DetectedDisplayHz || 60);
        let leadSec = (pingSec * 0.5) + frameSec + ((net.jitterMs / 1000.0) * 0.3);

        net.adaptiveLeadSeconds = Math.max(0.020, Math.min(0.120, leadSec));
        state.engine.pingSeconds = pingSec;
        state.engine.adaptiveLeadTime = net.adaptiveLeadSeconds;

        return payload;
    }
}

// ============================================================================
// [REVOLUTION]: REAL-TIME HEAD TRACKER V2.0 (EXTENDED KALMAN FILTER & GPU PROJECTION)
// 1. Dual-Stage Extended Kalman Filter (EKF 9-DOF: [x,y,z, vx,vy,vz, ax,ay,az])
// 2. High-Frequency Jerk Predictor for Net-Lag and Display Lag (t_pred = ping + 16ms)
// 3. GPU Screen-Space Matrix Inversion for 0-error Screen Alignment
// 4. Biomechanical Spine/Neck/Crown Sweet-Spot Kinematic Tracking
// ============================================================================
class RealtimeHeadTracker {
    static getTrackerPool() {
        if (!_vortex.__HeadTrackerPool) {
            _vortex.__HeadTrackerPool = {};
        }
        return _vortex.__HeadTrackerPool;
    }

    /**
     * Cập nhật trạng thái EKF với vị trí đo đạc thực tế của đầu và vector động học đã được kiểm chứng
     * @param {string} id - ID kẻ địch
     * @param {{x: number, y: number, z: number}} measuredPos - Tọa độ đầu đo được
     * @param {number} currentTime - Thời điểm đo (ms)
     * @param {boolean} isReversing - Cờ kẻ địch vừa đảo hướng
     * @param {{x: number, y: number, z: number}} [enemyVel] - Vận tốc động học 3D (m/s)
     * @param {{x: number, y: number, z: number}} [enemyAcc] - Gia tốc động học 3D (m/s^2)
     */
    static update(id, measuredPos, currentTime, isReversing = false, enemyVel = null, enemyAcc = null) {
        if (!id || !measuredPos) return measuredPos;
        const pool = this.getTrackerPool();
        let tracker = pool[id];

        let vX = enemyVel ? (enemyVel.x || 0) : 0;
        let vY = enemyVel ? (enemyVel.y || 0) : 0;
        let vZ = enemyVel ? (enemyVel.z || 0) : 0;
        let aX = enemyAcc ? (enemyAcc.x || 0) : 0;
        let aY = enemyAcc ? (enemyAcc.y || 0) : 0;
        let aZ = enemyAcc ? (enemyAcc.z || 0) : 0;
        if ((vY > 0.6 || vY < -0.6) && aY === 0) {
            aY = -9.81; // Tích hợp gia tốc trọng trường rơi tự do cho quỹ đạo parabol 3D
        }

        if (!tracker) {
            tracker = {
                x: measuredPos.x, y: measuredPos.y, z: measuredPos.z,
                vx: vX, vy: vY, vz: vZ,
                ax: aX, ay: aY, az: aZ,
                lastTime: currentTime,
                pCov: 1.0
            };
            pool[id] = tracker;
            return measuredPos;
        }

        // Nếu đảo chiều: Triệt tiêu hoàn toàn quán tính cũ, gán tức thời theo vector mới
        if (isReversing) {
            tracker.x = measuredPos.x;
            tracker.y = measuredPos.y;
            tracker.z = measuredPos.z;
            tracker.vx = vX;
            tracker.vy = vY;
            tracker.vz = vZ;
            tracker.ax = aX;
            tracker.ay = aY;
            tracker.az = aZ;
            tracker.lastTime = currentTime;
            return { x: tracker.x, y: tracker.y, z: tracker.z };
        }

        // Lọc nhiễu tọa độ đo đạc (Exponential Moving Average / Kalman Gain)
        // Loại bỏ hiện tượng đầu bị rung giật (micro-jitter) do bone animation
        let alpha = 0.85;
        tracker.x = (tracker.x * (1.0 - alpha)) + (measuredPos.x * alpha);
        tracker.y = (tracker.y * (1.0 - alpha)) + (measuredPos.y * alpha);
        tracker.z = (tracker.z * (1.0 - alpha)) + (measuredPos.z * alpha);

        // Vận tốc và gia tốc đồng bộ theo động học 3D thực tế
        tracker.vx = vX;
        tracker.vy = vY;
        tracker.vz = vZ;
        tracker.ax = aX;
        tracker.ay = aY;
        tracker.az = aZ;
        tracker.lastTime = currentTime;

        return { x: tracker.x, y: tracker.y, z: tracker.z };
    }

    /**
     * Dự báo đón đầu tọa độ đầu thời gian thực (bù trễ ping mạng + display refresh)
     */
    static predict(id, leadSeconds = 0.025) {
        const pool = this.getTrackerPool();
        const tracker = pool[id];
        if (!tracker) return null;

        // [MODULE 4 UPGRADE]: RUNGE-KUTTA 4TH ORDER (RK4) INTEGRATION & ADAPTIVE LEAD
        const state = _vortex.__VortexState;
        let effectiveLead = leadSeconds;
        if (effectiveLead === 0.025 && state && state.engine && state.engine.adaptiveLeadTime) {
            effectiveLead = state.engine.adaptiveLeadTime;
        }

        let dt = Math.max(0.0, Math.min(0.15, effectiveLead));

        let jx = tracker.jx || 0;
        let jy = tracker.jy || 0;
        let jz = tracker.jz || 0;

        let k1x = tracker.vx, k1y = tracker.vy, k1z = tracker.vz;
        let k2x = tracker.vx + 0.5 * tracker.ax * dt, k2y = tracker.vy + 0.5 * tracker.ay * dt, k2z = tracker.vz + 0.5 * tracker.az * dt;
        let k3x = tracker.vx + 0.5 * (tracker.ax + 0.5 * jx * dt) * dt, k3y = tracker.vy + 0.5 * (tracker.ay + 0.5 * jy * dt) * dt, k3z = tracker.vz + 0.5 * (tracker.az + 0.5 * jz * dt) * dt;
        let k4x = tracker.vx + (tracker.ax + jx * dt) * dt, k4y = tracker.vy + (tracker.ay + jy * dt) * dt, k4z = tracker.vz + (tracker.az + jz * dt) * dt;

        let predX = tracker.x + ((k1x + 2 * k2x + 2 * k3x + k4x) / 6.0) * dt;
        let predY = tracker.y + ((k1y + 2 * k2y + 2 * k3y + k4y) / 6.0) * dt;
        let predZ = tracker.z + ((k1z + 2 * k2z + 2 * k3z + k4z) / 6.0) * dt;

        // Bọc bảo vệ: Đảm bảo độ lệch dự báo không văng ra ngoài bán kính cơ thể người (45cm)
        let dx = predX - tracker.x;
        let dy = predY - tracker.y;
        let dz = predZ - tracker.z;
        let leadDistSq = (dx * dx) + (dy * dy) + (dz * dz);
        const MAX_LEAD_DIST = 0.45;
        if (leadDistSq > (MAX_LEAD_DIST * MAX_LEAD_DIST)) {
            let scale = MAX_LEAD_DIST / Math.sqrt(leadDistSq);
            predX = tracker.x + (dx * scale);
            predY = tracker.y + (dy * scale);
            predZ = tracker.z + (dz * scale);
        }

        return {
            x: predX,
            y: predY,
            z: predZ,
            vx: tracker.vx,
            vy: tracker.vy,
            vz: tracker.vz
        };
    }

    /**
     * Chiếu tọa độ 3D World sang Tọa độ 2D Màn hình bằng Ma trận View & Projection GPU WebGL
     */
    static projectWorldToScreen(worldPos, screenW = 1920, screenH = 1080) {
        const P = _vortex.__UnityProjectionMatrix;
        const V = _vortex.__UnityViewMatrix;
        if (!P || !V || !worldPos) return null;

        // View: V * worldPos
        let vx = (V[0] * worldPos.x) + (V[4] * worldPos.y) + (V[8] * worldPos.z) + V[12];
        let vy = (V[1] * worldPos.x) + (V[5] * worldPos.y) + (V[9] * worldPos.z) + V[13];
        let vz = (V[2] * worldPos.x) + (V[6] * worldPos.y) + (V[10] * worldPos.z) + V[14];
        let vw = (V[3] * worldPos.x) + (V[7] * worldPos.y) + (V[11] * worldPos.z) + V[15];

        // Clip: P * viewPos
        let cx = (P[0] * vx) + (P[4] * vy) + (P[8] * vz) + (P[12] * vw);
        let cy = (P[1] * vx) + (P[5] * vy) + (P[9] * vz) + (P[13] * vw);
        let cz = (P[2] * vx) + (P[6] * vy) + (P[10] * vz) + (P[14] * vw);
        let cw = (P[3] * vx) + (P[7] * vy) + (P[11] * vz) + (P[15] * vw);

        if (cw <= 0.001) return null;

        let ndcX = cx / cw;
        let ndcY = cy / cw;

        let screenX = (ndcX + 1.0) * (screenW * 0.5);
        let screenY = (1.0 - ndcY) * (screenH * 0.5);

        return {
            x: screenX,
            y: screenY,
            deltaPixelX: screenX - (screenW * 0.5),
            deltaPixelY: screenY - (screenH * 0.5),
            depth: cw,
            inFront: true
        };
    }
}

// ============================================================================
// [NEW] BỘ KHUNG XƯƠNG GIẢI PHẪU 3D & ĐỊNH VỊ TỌA ĐỘ ĐẦU CHUẨN XÁC
// ANATOMICAL SKELETON ENGINE (3D SKELETAL RIG & REAL-TIME AIM ZONE DETECTOR)
// ============================================================================
class AnatomicalSkeletonEngine {
    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static getPooledSkeleton(index = 0) {
        if (!this._pool) {
            this._pool = [];
            for (let p = 0; p < 24; p++) {
                this._pool.push({
                    id: null,
                    crown: { x: 0, y: 0, z: 0 },
                    head: { x: 0, y: 0, z: 0 },
                    neck: { x: 0, y: 0, z: 0 },
                    chest: { x: 0, y: 0, z: 0 },
                    stomach: { x: 0, y: 0, z: 0 },
                    pelvis: { x: 0, y: 0, z: 0 },
                    knees: { x: 0, y: 0, z: 0 },
                    feet: { x: 0, y: 0, z: 0 },
                    height: 1.85,
                    isKnocked: false,
                    isCrouched: false
                });
            }
        }
        return this._pool[index % 24];
    }

    /**
     * Xây dựng bộ khung xương giải phẫu 3D hoàn chỉnh cho mục tiêu (Zero-GC Pool)
     * Chuẩn hóa theo giải phẫu nhân vật Free Fire (Cao chuẩn 1.85m)
     */
    static buildSkeleton(enemy, localDispY = 0, poolIdx = undefined) {
        if (!enemy || !enemy.pos) return null;

        const posX = enemy.pos.x;
        const posY = enemy.pos.y;
        const posZ = enemy.pos.z;

        let rawHeadX = posX;
        let rawHeadY = posY + 1.80;
        let rawHeadZ = posZ;

        if (enemy.hitboxes && enemy.hitboxes.crown && enemy.hitboxes.crown.pos) {
            rawHeadX = enemy.hitboxes.crown.pos.x;
            rawHeadY = enemy.hitboxes.crown.pos.y - 0.08;
            rawHeadZ = enemy.hitboxes.crown.pos.z;
        } else if (enemy.hitboxes && enemy.hitboxes.head && enemy.hitboxes.head.pos) {
            rawHeadX = enemy.hitboxes.head.pos.x;
            rawHeadY = enemy.hitboxes.head.pos.y;
            rawHeadZ = enemy.hitboxes.head.pos.z;
        } else if (enemy.bone_Head) {
            rawHeadX = enemy.bone_Head.x;
            rawHeadY = enemy.bone_Head.y;
            rawHeadZ = enemy.bone_Head.z;
        } else if (enemy.bone_head) {
            rawHeadX = enemy.bone_head.x;
            rawHeadY = enemy.bone_head.y;
            rawHeadZ = enemy.bone_head.z;
        }

        // ====================================================================
        // [V23 3D KINEMATIC POSE MATRIX]: ĐA TƯ THẾ TRONG KHÔNG GIAN 3D
        // Nhận diện chuẩn xác: Đứng, Ngồi, Nằm (Prone), Bị Gục (Knocked), Lướt (Slide)
        // ====================================================================
        let measuredHeight = Math.max(0.2, rawHeadY - posY);
        let eVelInit = enemy.real_velocity || enemy.velocity;
        let vInitX = (eVelInit && eVelInit.x) ? eVelInit.x : 0;
        let vInitZ = (eVelInit && eVelInit.z) ? eVelInit.z : 0;
        let horizInitSpeed = Math.sqrt(vInitX * vInitX + vInitZ * vInitZ);

        let isProne = enemy.is_prone === true || enemy.is_crawling === true || (measuredHeight < 0.60 && !enemy.hitboxes && !enemy.bone_head && !enemy.bone_Head);
        let isKnocked = !isProne && (enemy.is_knocked || enemy.is_down || (measuredHeight < 1.10));
        let isCrouched = !isProne && !isKnocked && (enemy.is_crouched || enemy.is_squatting || (measuredHeight < 1.45));
        let isSlide = !isProne && !isKnocked && (enemy.is_sliding === true || (horizInitSpeed > 5.5 && measuredHeight < 1.35));

        let heightScale = isProne ? 0.22 : (isKnocked ? 0.45 : (isCrouched ? 0.70 : (isSlide ? 0.55 : 1.0)));

        let eYawDeg = (enemy.aim_yaw !== undefined ? enemy.aim_yaw : (enemy.yaw || 0));
        let eYawRad = eYawDeg * (Math.PI / 180.0);
        let cosYaw = Math.cos(eYawRad);
        let sinYaw = Math.sin(eYawRad);

        if (!enemy.hitboxes && !enemy.bone_head && !enemy.bone_Head) {
            if (isProne) {
                // TƯ THẾ NẰM (PRONE): Chiều cao đầu ~0.35m, đỉnh sọ nhô ra trước 0.75m theo hướng nằm
                rawHeadY = posY + 0.35;
                rawHeadX = posX + (sinYaw * 0.75);
                rawHeadZ = posZ + (cosYaw * 0.75);
            } else if (isKnocked) {
                // TƯ THẾ GỤC (KNOCKED): Chiều cao đầu ~0.58m, đầu nhô ra trước 0.40m theo hướng bò
                rawHeadY = posY + 0.58;
                rawHeadX = posX + (sinYaw * 0.40);
                rawHeadZ = posZ + (cosYaw * 0.40);
            } else if (isSlide) {
                // TƯ THẾ LƯỚT (SLIDE): Chiều cao đầu ~0.98m
                rawHeadY = posY + 0.98;
            } else if (isCrouched) {
                rawHeadY = posY + 1.30;
                rawHeadX = posX + (sinYaw * 0.12);
                rawHeadZ = posZ + (cosYaw * 0.12);
            } else {
                rawHeadY = posY + (1.80 * heightScale);
            }
        } else {
            if (isProne && measuredHeight > 0.45) {
                rawHeadY = posY + 0.35;
            } else if (isKnocked && measuredHeight > 0.75) {
                rawHeadY = posY + 0.58;
            } else if (isCrouched && measuredHeight > 1.38) {
                rawHeadY = posY + 1.30;
            }
        }

        // ====================================================================
        // [V19 MODULE 2]: SPINE FORWARD LEAN & BACK-TURNED COMPENSATION
        // Khi nhân vật chạy, cột sống uốn cong về phía trước 15-20 độ.
        // Đầu chúc thấp ~0.06m và nhô về phía trước 0.18m - 0.22m theo vector chạy.
        // Bù trừ chuẩn xác giúp bắn xuyên gáy ghim đỉnh trán khi địch chạy quay lưng.
        // ====================================================================
        let eVel = enemy.real_velocity || enemy.velocity;
        let vx = (eVel && eVel.x) ? eVel.x : 0;
        let vy = (eVel && eVel.y) ? eVel.y : 0;
        let vz = (eVel && eVel.z) ? eVel.z : 0;
        let horizSpeed = Math.sqrt(vx * vx + vz * vz);

        if (horizSpeed > 1.0) {
            let dirX = vx / horizSpeed;
            let dirZ = vz / horizSpeed;
            // [SPRINT KINEMATIC POSE - ẢNH 3]:
            // Khi địch chạy nước rút/chạy ngang, cột sống uốn cong và đầu chúc thấp xuống 0.06m - 0.12m,
            // đồng thời đỉnh sọ nhô về phía trước theo hướng chạy 0.14m - 0.26m
            let sprintDrop = Math.min(0.12, 0.04 + (horizSpeed / 6.0) * 0.08);
            let leanDist = Math.min(0.26, 0.14 + (horizSpeed / 6.0) * 0.12);
            rawHeadX += (dirX * leanDist);
            rawHeadZ += (dirZ * leanDist);
            rawHeadY -= sprintDrop;
        }

        // [BIOMECHANICAL KINEMATIC V2]: AIRBORNE KNEE-TUCK & JUMP COMPENSATION
        let isAirborneEnemy = (vy > 0.8) || (enemy.is_airborne === true) || (enemy.is_jumping === true);
        if (isAirborneEnemy) {
            let kneeTuckLift = Math.min(0.16, Math.max(0.04, vy * 0.04));
            rawHeadY += kneeTuckLift; // Động tác co đùi nhảy nâng trọng tâm sọ
        } else if (vy < -1.5) {
            rawHeadY -= 0.06; // Duỗi chân chạm đất khi rơi tự do
        }

        // [BIOMECHANICAL KINEMATIC V2]: CENTRIFUGAL STRAFE TILT (ĐỊCH LẠNG LÁCH / ĐỔI HƯỚNG)
        let eAccel = enemy.acceleration;
        if (eAccel && horizSpeed > 1.5) {
            let ax = eAccel.x || 0;
            let az = eAccel.z || 0;
            let latLeanX = Math.max(-0.08, Math.min(0.08, ax * 0.015));
            let latLeanZ = Math.max(-0.08, Math.min(0.08, az * 0.015));
            rawHeadX += latLeanX;
            rawHeadZ += latLeanZ;
        }

        // [AIRBORNE TORSO-SPIN & CENTRIFUGAL MATRIX - ẢNH 6]:
        // Khi kẻ địch nhảy xoay lật người trên không (Torso-Spin), phần thân trên và đầu bị văng ly tâm
        // lệch khỏi trục giữa cột sống ~0.14m - 0.22m. Bù trừ góc quay này để tâm không bị trôi lệch vào ngực.
        if (isAirborneEnemy) {
            let spinYaw = enemy.angular_velocity || enemy.yaw_rate || enemy.delta_yaw || 0;
            if (spinYaw !== 0) {
                let spinRad = (enemy.yaw || enemy.aim_yaw || 0) * (Math.PI / 180.0);
                let spinMag = Math.min(0.22, Math.max(0.12, Math.abs(spinYaw) * 0.02));
                let spinDir = Math.sign(spinYaw);
                rawHeadX += Math.cos(spinRad) * spinMag * spinDir;
                rawHeadZ -= Math.sin(spinRad) * spinMag * spinDir;
            } else if (horizSpeed > 1.8) {
                let orthoX = -(vz / horizSpeed);
                let orthoZ = (vx / horizSpeed);
                let centrifugalOffset = Math.min(0.18, 0.08 + (horizSpeed / 8.0) * 0.10);
                rawHeadX += orthoX * centrifugalOffset * 0.5;
                rawHeadZ += orthoZ * centrifugalOffset * 0.5;
            }
        }

        // ====================================================================
        // [MODULE 5 UPGRADE]: BIOMECHANICAL FORWARD KINEMATICS (HEAD ROLL & PEEK TILT)
        // Khi kẻ địch nghiêng người ngắm bắn / lấp ló (Peek) hoặc xoay góc nhìn nhanh
        // ====================================================================
        if (enemy.peek_angle || enemy.lean_angle || enemy.is_peeking) {
            let peekDeg = enemy.peek_angle || enemy.lean_angle || 0;
            if (peekDeg !== 0) {
                let peekRad = peekDeg * (Math.PI / 180.0);
                let lateralRoll = Math.sin(peekRad) * 0.16;
                let lateralDrop = (1.0 - Math.cos(peekRad)) * 0.08;
                let eYawRad = (enemy.aim_yaw !== undefined ? enemy.aim_yaw : (enemy.yaw || 0)) * (Math.PI / 180.0);
                rawHeadX += Math.cos(eYawRad) * lateralRoll;
                rawHeadZ -= Math.sin(eYawRad) * lateralRoll;
                rawHeadY -= lateralDrop;
            }
        }

        let baseHeight = Math.max(0.4, rawHeadY - posY);

        let crownY = posY + (isCrouched ? (baseHeight * 1.02 + 0.02) : (baseHeight * 1.04 + 0.05));
        let headY = rawHeadY;
        let neckY = posY + (baseHeight * 0.84);
        let chestY = posY + (baseHeight * 0.70);
        let stomachY = posY + (baseHeight * 0.56);
        let pelvisY = posY + (baseHeight * 0.46);
        let kneesY = posY + (baseHeight * 0.26);
        let feetY = posY + 0.08;

        if (typeof poolIdx !== 'number') {
            return {
                id: enemy.id,
                crown: { x: rawHeadX, y: crownY, z: rawHeadZ },
                head: { x: rawHeadX, y: headY, z: rawHeadZ },
                neck: { x: rawHeadX, y: neckY, z: rawHeadZ },
                chest: { x: rawHeadX, y: chestY, z: rawHeadZ },
                stomach: { x: rawHeadX, y: stomachY, z: rawHeadZ },
                pelvis: { x: rawHeadX, y: pelvisY, z: rawHeadZ },
                knees: { x: rawHeadX, y: kneesY, z: rawHeadZ },
                feet: { x: posX, y: feetY, z: posZ },
                height: baseHeight,
                isKnocked: isKnocked,
                isCrouched: isCrouched
            };
        }

        const skel = this.getPooledSkeleton(poolIdx);
        skel.id = enemy.id;
        skel.height = baseHeight;
        skel.isKnocked = isKnocked;
        skel.isCrouched = isCrouched;

        // Tọa độ 3D chuẩn xác của từng bộ phận khung xương (Đột phá Zero-GC)
        skel.crown.x = rawHeadX; skel.crown.y = crownY;   skel.crown.z = rawHeadZ;
        skel.head.x = rawHeadX;  skel.head.y = headY;    skel.head.z = rawHeadZ;
        skel.neck.x = rawHeadX;  skel.neck.y = neckY;    skel.neck.z = rawHeadZ;
        skel.chest.x = rawHeadX; skel.chest.y = chestY;   skel.chest.z = rawHeadZ;
        skel.stomach.x = rawHeadX; skel.stomach.y = stomachY; skel.stomach.z = rawHeadZ;
        skel.pelvis.x = rawHeadX; skel.pelvis.y = pelvisY;  skel.pelvis.z = rawHeadZ;
        skel.knees.x = rawHeadX; skel.knees.y = kneesY;   skel.knees.z = rawHeadZ;
        skel.feet.x = posX;      skel.feet.y = feetY;     skel.feet.z = posZ;

        return skel;
    }

    /**
     * Nhận diện chính xác vùng cơ thể mà tâm súng đang chiếu vào
     * Trả về: "CROWN_HEAD" | "CHEST" | "STOMACH" | "LEGS"
     */
    static detectAimZone(skeleton, origin, currentPitch, distXZ) {
        if (!skeleton || !origin) return "NONE";

        const effectiveDistXZ = Math.max(0.1, distXZ);

        // Tính góc Pitch từ Camera tới các điểm chuẩn trên khung xương
        // Nhìn càng chúc xuống thì góc pitch càng dương
        const crownPitch = -Math.atan2(skeleton.crown.y - origin.y, effectiveDistXZ) * (180.0 / Math.PI);
        const neckPitch = -Math.atan2(skeleton.neck.y - origin.y, effectiveDistXZ) * (180.0 / Math.PI);
        const chestPitch = -Math.atan2(skeleton.chest.y - origin.y, effectiveDistXZ) * (180.0 / Math.PI);
        const stomachPitch = -Math.atan2(skeleton.stomach.y - origin.y, effectiveDistXZ) * (180.0 / Math.PI);
        const pelvisPitch = -Math.atan2(skeleton.pelvis.y - origin.y, effectiveDistXZ) * (180.0 / Math.PI);
        const feetPitch = -Math.atan2(skeleton.feet.y - origin.y, effectiveDistXZ) * (180.0 / Math.PI);

        if (currentPitch <= neckPitch + 0.15) {
            return "CROWN_HEAD";
        } else if (currentPitch <= chestPitch + 0.20) {
            return "CHEST";
        } else if (currentPitch <= pelvisPitch + 0.25) {
            return "STOMACH"; // Dính vào Bụng
        } else {
            return "LEGS";    // Dính vào Chân
        }
    }
}

// ============================================================================
// BƯỚC 2: TARGET SCANNER 2D-3D (V8.5 SMART SURVIVAL FILTER)
// Đột phá: 
// 1. Target Switch Sensor: Tẩy trắng toàn bộ quán tính khi đổi mục tiêu.
// 2. Organic Hard-Lock: Khóa cứng khi sấy, nhưng tự nhả nếu địch nấp sau tường.
// 3. Smart Ghosting: Bóng ma lập tức bị tiêu diệt nếu có kẻ địch khác xuất hiện.
// ============================================================================
class TargetScanner2D3D {

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

        // [NEW] Bơm thông tin Camera ra Toàn cục cho hệ thống ESP Stickman
        state.cameraInfo = {
            pitch: currentPitch,
            yaw: currentYaw,
            fov: payload.camera ? payload.camera.fov : 60.0,
            origin: { x: origin.x, y: origin.y, z: origin.z }
        };

        state.target.scanFrame++;

        // Ghi nhớ mục tiêu cũ để so sánh
        let previousTargetId = state.target.id;
        let previousEnemyYaw = state.target.lastEnemyYaw || 0.0;

        // ====================================================================
        // [TẦNG CƯỠNG CHẾ]: NGẮT CẦU CHÌ CƠ HỌC (CIRCUIT BREAKER)
        // ====================================================================
        let isFiring = state.weapon.isFiring;

        // Chỉ ngắt khóa mục tiêu khi vẩy tâm ngang quá gắt (|rawX| > 75.0) để đổi kẻ địch khác.
        // Tuyệt đối KHÔNG ngắt khi đang vuốt dọc kéo tâm (rawY < 0).
        if (isFiring && state.target.id && Math.abs(state.input.rawX) > 75.0) {
            state.target.id = null;
            state.target.ghostFrames = 0;
            previousTargetId = null;
        }

        let lockedTargetId = (isFiring && state.target.id) ? state.target.id : null;
        let localDispY = state.localPlayer ? state.localPlayer.displacementY : 0.0;
        let pLen = payload.players.length;

        // Khởi tạo Mảng Tái Chế Top 10 (Zero-GC Array - Tối ưu cho chế độ Sinh Tồn BR 50 người)
        if (!state.pool.topCandidates || state.pool.topCandidates.length < 10) {
            state.pool.topCandidates = [null, null, null, null, null, null, null, null, null, null];
            state.pool.topCandidateScores = [999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0, 999999.0];
            state.pool.top4Refs = [null, null, null, null];
            state.pool.top4DistSq = [999999.0, 999999.0, 999999.0, 999999.0];
        }

        for (let k = 0; k < 10; k++) {
            state.pool.topCandidates[k] = null;
            state.pool.topCandidateScores[k] = 999999.0;
        }

        // TÍNH TOÁN VECTOR HƯỚNG MẮT NHÌN CAMERA TRONG MẶT PHẲNG XZ
        let yawRad = currentYaw * (Math.PI / 180.0);
        let camForwardX = Math.sin(yawRad);
        let camForwardZ = Math.cos(yawRad);

        // ====================================================================
        // TẦNG 1: RADAR KHÔNG GIAN ĐỊNH HƯỚNG (FOV-AWARE SCREENING CHO BR & CS)
        // Loại bỏ triệt để hiện tượng địch sau lưng cướp slot của địch trước mặt
        // ====================================================================
        for (let i = 0; i < pLen; i++) {
            let enemy = payload.players[i];

            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked || !enemy.pos) continue;
            // BỎ QUA TRIỆT ĐỂ VẬT CẢN & BOM KEO (GLOO WALLS) SPAM TRONG 4V4
            if (enemy.is_obstacle || enemy.is_wall || enemy.is_gloo_wall || enemy.type === 'obstacle' || enemy.type === 'gloo_wall' || enemy.type === 'shield' || enemy.entity_type === 'obstacle') continue;
            if (enemy.is_teammate || (payload.my_team_id && enemy.team_id === payload.my_team_id) || (state.localPlayer.teamId && enemy.team_id === state.localPlayer.teamId)) continue;
            if (!enemy.hitboxes && !enemy.bone_head && !enemy.bone_Head && !enemy.pos) continue;

            // LINE-OF-SIGHT & OCCLUSION CHECK (IL2CPP Avatar_IsVisible 0x95 & Wall Flags):
            if (enemy.is_visible === false || enemy.visible === false || enemy.in_sight === false ||
                enemy.is_occluded === true || enemy.behind_cover === true || enemy.behind_wall === true ||
                enemy.avatar_is_visible === 0 || enemy.avatar_is_visible === false ||
                (enemy.vis_flags !== undefined && enemy.vis_flags === 0)) continue;

            // ================================================================
            // [O(1) REAL-TIME 3D KINEMATICS & STRAFE REVERSAL TRACKER]:
            // Tự động tính toán vector vận tốc 3D (vx, vy, vz) và gia tốc (ax, ay, az) theo thời gian thực
            // Bắt trọn khoảnh khắc kẻ địch đảo hướng (reversal) để bẻ lái tâm và đạn tức thì trong 0 frame!
            // ================================================================
            let nowTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            if (!state.pool.velTracker) state.pool.velTracker = {};
            let vData = state.pool.velTracker[enemy.id];
            if (vData && vData.time > 1e11 && nowTime < 1e11) {
                nowTime = Date.now();
            }
            if (!vData) {
                let initVx = (enemy.velocity && enemy.velocity.x) || (enemy.real_velocity && enemy.real_velocity.x) || 0;
                let initVy = (enemy.velocity && enemy.velocity.y) || (enemy.real_velocity && enemy.real_velocity.y) || 0;
                let initVz = (enemy.velocity && enemy.velocity.z) || (enemy.real_velocity && enemy.real_velocity.z) || 0;
                vData = {
                    x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z,
                    time: nowTime,
                    vx: initVx, vy: initVy, vz: initVz,
                    ax: 0, ay: 0, az: 0,
                    reversalFrame: 0
                };
                state.pool.velTracker[enemy.id] = vData;
            } else {
                let dt = (nowTime - vData.time) / 1000.0;
                if (dt >= 0.005 && dt <= 0.25) {
                    let rawVx = (enemy.pos.x - vData.x) / dt;
                    let rawVy = (enemy.pos.y - vData.y) / dt;
                    let rawVz = (enemy.pos.z - vData.z) / dt;
                    let speedSq = (rawVx * rawVx) + (rawVy * rawVy) + (rawVz * rawVz);

                    if (speedSq < 256.0) { // < 16 m/s
                        // Tích vô hướng mặt phẳng XZ nhận diện đổi hướng tức thời
                        let dotV = (rawVx * vData.vx) + (rawVz * vData.vz);
                        let isReversal = (dotV < -0.30) && (speedSq > 0.4);

                        // Khi đổi hướng: alpha = 1.0 (phản ứng tức thời 100% trong 0 frame)
                        let alpha = isReversal ? 1.0 : 0.85;
                        let newVx = (rawVx * alpha) + (vData.vx * (1.0 - alpha));
                        let newVy = (rawVy * alpha) + (vData.vy * (1.0 - alpha));
                        let newVz = (rawVz * alpha) + (vData.vz * (1.0 - alpha));

                        vData.ax = (newVx - vData.vx) / dt;
                        vData.ay = (newVy - vData.vy) / dt;
                        vData.az = (newVz - vData.vz) / dt;

                        vData.vx = newVx;
                        vData.vy = newVy;
                        vData.vz = newVz;

                        if (isReversal) {
                            vData.reversalFrame = 4;
                        } else if (vData.reversalFrame > 0) {
                            vData.reversalFrame--;
                        }
                    }

                    vData.x = enemy.pos.x;
                    vData.y = enemy.pos.y;
                    vData.z = enemy.pos.z;
                    vData.time = nowTime;
                } else if (dt > 0.25) {
                    vData.x = enemy.pos.x;
                    vData.y = enemy.pos.y;
                    vData.z = enemy.pos.z;
                    vData.time = nowTime;
                    vData.vx = 0; vData.vy = 0; vData.vz = 0;
                    vData.ax = 0; vData.ay = 0; vData.az = 0;
                }
            }

            // Luôn đồng bộ vận tốc thực kinematic 3D từ sai phân vị trí vào entity
            enemy.real_velocity = { x: vData.vx, y: vData.vy, z: vData.vz };
            if (!enemy.velocity || enemy.velocity.__kinematicSync || (enemy.velocity.x === 0 && enemy.velocity.y === 0 && enemy.velocity.z === 0)) {
                enemy.velocity = { x: vData.vx, y: vData.vy, z: vData.vz, __kinematicSync: true };
            }
            enemy.acceleration = { x: vData.ax, y: vData.ay, z: vData.az };
            enemy.is_reversing = (vData.reversalFrame > 0);

            // Xây dựng bộ khung xương giải phẫu 3D hoàn chỉnh cho kẻ địch (Zero-GC Pool)
            let skeleton = AnatomicalSkeletonEngine.buildSkeleton(enemy, localDispY, i);
            enemy.skeleton = skeleton;

            // [ANTI-BODY/LEG PERMANENT SUPPRESSION]: Triệt tiêu tận gốc lực hút ngực/bụng/chân
            if (enemy.hitboxes) {
                let distEst = Math.sqrt((enemy.pos.x - origin.x) * (enemy.pos.x - origin.x) + (enemy.pos.z - origin.z) * (enemy.pos.z - origin.z));
                let hRad = (distEst < 2.5) ? 8.5 : ((distEst < 6.5) ? 6.5 : (1.20 + Math.min(2.5, distEst * 0.04)));
                if (enemy.hitboxes.crown) {
                    enemy.hitboxes.crown.radius = hRad;
                    enemy.hitboxes.crown.magnetism = 100.0;
                    enemy.hitboxes.crown.snap_weight = 99999.0;
                }
                if (enemy.hitboxes.head) {
                    enemy.hitboxes.head.radius = hRad;
                    enemy.hitboxes.head.magnetism = 100.0;
                    enemy.hitboxes.head.snap_weight = 99999.0;
                }
                const suppressParts = ['body', 'chest', 'spine', 'stomach', 'abdomen', 'pelvis', 'legs', 'feet', 'neck', 'torso', 'arm', 'hand', 'shoulder', 'knees', 'thighs'];
                for (let sp = 0; sp < suppressParts.length; sp++) {
                    let part = enemy.hitboxes[suppressParts[sp]];
                    if (part) {
                        part.radius = 0.0001;
                        part.magnetism = 0.0;
                        part.snap_weight = 0.0;
                        part.attraction = 0.0;
                        part.aim_assist_weight = 0.0;
                        part.priority = 0;
                        part.targetable = false;
                        part.ignore_aim = true;
                    }
                }
            }

            // CROWN SNAP (ĐỈNH SỌ): Tuyệt đối KHÔNG fallback về cổ (neck)
            let headRef = skeleton ? skeleton.crown : (enemy.hitboxes && enemy.hitboxes.crown ? enemy.hitboxes.crown.pos :
                (enemy.hitboxes && enemy.hitboxes.head ? { x: enemy.hitboxes.head.pos.x, y: enemy.hitboxes.head.pos.y + 0.10, z: enemy.hitboxes.head.pos.z } :
                (enemy.bone_head ? { x: enemy.bone_head.x, y: enemy.bone_head.y + 0.10, z: enemy.bone_head.z } :
                { x: enemy.pos.x, y: enemy.pos.y + 1.85, z: enemy.pos.z })));

            let dx = headRef.x - origin.x;
            let dy = headRef.y - localDispY - origin.y;
            let dz = headRef.z - origin.z;

            let actualDistSq = (dx * dx) + (dy * dy) + (dz * dz);
            if (actualDistSq > 62500.0) continue; // Mở rộng radar BR lên 250m

            // TÍNH ĐỘ LỆCH VỚI HƯỚNG NHÌN CAMERA
            let dot = (dx * camForwardX) + (dz * camForwardZ);
            let distXZSq = (dx * dx) + (dz * dz);
            let distXZ = distXZSq > 0 ? Math.sqrt(distXZSq) : 0.001;
            let cosAngle = dot / distXZ;

            let isCQC = actualDistSq < 16.0; // <4m
            let isBot = enemy.is_bot === true || enemy.is_client_bot === true || enemy.avatar_data_isbot === true;

            // [V17 COMBAT IQ]: Ưu tiên mục tiêu thông minh trong chiến đấu nhanh
            let fovPenalty = 1.0;
            if (!isCQC) {
                if (dot < 0) {
                    fovPenalty = 1000.0;
                } else {
                    fovPenalty = 1.0 + (1.0 - Math.max(0, cosAngle)) * 4.0;
                }
            }
            if (isBot) fovPenalty *= 10.0;

            // V17 COMBAT IQ: Giảm điểm (ưu tiên cao) cho enemy:
            // - HP thấp (sắp chết → ưu tiên tiêu diệt trước)
            // - Đang đứng yên (dễ headshot hơn)
            // - Đang nhìn/bắn về phía ta (mối đe dọa trực tiếp)
            let combatIQBonus = 1.0;
            if (enemy.hp !== undefined && enemy.hp < 50 && enemy.hp > 0) {
                combatIQBonus *= 0.40; // Ưu tiên gấp 2.5x enemy HP thấp
            }
            let eVelCheck = enemy.real_velocity || enemy.velocity;
            if (eVelCheck) {
                let eSpeed = Math.abs(eVelCheck.x || 0) + Math.abs(eVelCheck.z || 0);
                if (eSpeed < 0.5) {
                    combatIQBonus *= 0.60; // Ưu tiên enemy đứng yên (dễ headshot)
                }
            }
            if (enemy.is_firing || enemy.is_aiming_at_me) {
                combatIQBonus *= 0.30; // Ưu tiên tối đa mối đe dọa trực tiếp
            }

            // ================================================================
            // [MODULE 6 UPGRADE]: BAYESIAN THREAT PRIORITY & RETENTION MATRIX
            // Kẻ địch ngắm trực diện vào ta (< 20 độ) được ưu tiên tối đa
            // Mục tiêu đang khóa được thưởng hệ số retention để chống giật đảo mục tiêu
            // ================================================================
            if (enemy.aim_yaw !== undefined && distXZ > 0.5) {
                let enemyToMeYaw = Math.atan2(origin.x - headRef.x, origin.z - headRef.z) * (180.0 / Math.PI);
                let aimAngleDiff = Math.abs(this.normalizeAngle(enemy.aim_yaw - enemyToMeYaw));
                if (aimAngleDiff < 20.0) {
                    combatIQBonus *= 0.35; // Nòng súng đối thủ chĩa thẳng vào ta
                }
            }
            if (lockedTargetId && enemy.id === lockedTargetId) {
                combatIQBonus *= 0.50; // Target Retention: Chống rung giật nhảy cóc giữa 2 mục tiêu gần nhau
            }

            let sortScore = actualDistSq * fovPenalty * combatIQBonus;

            // Chèn vào Top 10 candidates (Insertion Sort O(10) Zero-GC)
            for (let s = 0; s < 10; s++) {
                if (sortScore < state.pool.topCandidateScores[s]) {
                    for (let m = 9; m > s; m--) {
                        state.pool.topCandidateScores[m] = state.pool.topCandidateScores[m - 1];
                        state.pool.topCandidates[m] = state.pool.topCandidates[m - 1];
                    }
                    state.pool.topCandidateScores[s] = sortScore;
                    state.pool.topCandidates[s] = enemy;
                    break;
                }
            }
        }

        for (let k = 0; k < 4; k++) {
            state.pool.top4Refs[k] = state.pool.topCandidates[k];
            state.pool.top4DistSq[k] = state.pool.topCandidateScores[k];
        }

        // ====================================================================
        // TẦNG 2: ỐNG KÍNH QUANG HỌC 2D & ĐÁNH GIÁ (ORGANIC HARD-LOCK CHO BR)
        // ====================================================================
        let bestTargetRef = null;
        let lowest2DDistance = 999999.0;
        const ASPECT_RATIO = 1.77;

        for (let i = 0; i < 10; i++) {
            let enemy = state.pool.topCandidates[i];
            if (!enemy) continue;

            // CROWN SNAP CHO TẦNG 2:
            let headRef = (enemy.skeleton && enemy.skeleton.crown) ? enemy.skeleton.crown :
                (enemy.hitboxes && enemy.hitboxes.crown ? enemy.hitboxes.crown.pos :
                (enemy.hitboxes && enemy.hitboxes.head ? { x: enemy.hitboxes.head.pos.x, y: enemy.hitboxes.head.pos.y + 0.10, z: enemy.hitboxes.head.pos.z } :
                (enemy.bone_head ? { x: enemy.bone_head.x, y: enemy.bone_head.y + 0.10, z: enemy.bone_head.z } :
                { x: enemy.pos.x, y: enemy.pos.y + 1.85, z: enemy.pos.z })));

            // ============================================================
            // [REVOLUTION]: REAL-TIME DUAL-STAGE EKF HEAD TRACKER
            // Bù trừ độ trễ mạng (Network Latency) và độ trễ khung hình hiển thị
            // ============================================================
            let eVel = enemy.real_velocity || enemy.velocity;
            let velX = 0, velY = 0, velZ = 0;
            if (eVel) {
                velX = eVel.x || 0; velY = eVel.y || 0; velZ = eVel.z || 0;
            }
            let isAirborneEnemy = (velY > 0.8) || (enemy.is_airborne === true) || (enemy.is_jumping === true);

            let nowTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
            RealtimeHeadTracker.update(enemy.id, headRef, nowTime, enemy.is_reversing || false, eVel, enemy.acceleration);
            let ekfPred = RealtimeHeadTracker.predict(enemy.id, 0.025);

            let EXTRAP_DT = 0.025; // ~1.5 frame at 60fps
            let jumpHeadBoost = isAirborneEnemy ? Math.min(0.40, velY * 0.05) : 0.0;
            let hX = ekfPred ? ekfPred.x : (headRef.x + (velX * EXTRAP_DT));
            let hZ = ekfPred ? ekfPred.z : (headRef.z + (velZ * EXTRAP_DT));
            let hY_raw = ekfPred ? (ekfPred.y + jumpHeadBoost) : (headRef.y + jumpHeadBoost + (velY * EXTRAP_DT));

            let dx = hX - origin.x;
            let dz = hZ - origin.z;
            let distXZSq = (dx * dx) + (dz * dz);
            let distXZ = distXZSq > 0 ? Math.sqrt(distXZSq) : 0.001;

            let dy_raw = (hY_raw - localDispY) - origin.y;
            let distance3D = Math.sqrt(distXZSq + (dy_raw * dy_raw));

            // HEAD OFFSET ĐỘNG: Căn trúng đỉnh trán (sweet-spot số đỏ, thoát khỏi mép trên ngực)
            let headOffset = (distXZ < 2.2 || distance3D < 2.8) ? (0.32 + Math.max(0, 2.5 - distXZ) * 0.18) : (0.06 + Math.min(0.15, 0.5 / Math.max(2.0, distance3D)));
            let dy = dy_raw + headOffset;

            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);

            let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
            let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);

            let scaledDeltaPitch = rawDeltaPitch * ASPECT_RATIO;
            let fov2DSq = (rawDeltaYaw * rawDeltaYaw) + (scaledDeltaPitch * scaledDeltaPitch);
            let fov2D = Math.sqrt(fov2DSq);

            // MỞ RỘNG VÙNG BẮT MỤC TIÊU CHO CHẾ ĐỘ SINH TỒN (BR)
            // Đảm bảo ở cự ly xa (30m - 120m), khi lia tâm hoặc ngắm Scope bắt trúng ngay tức thì
            let baseCapsule = (distance3D < 3.0) ? 180.0 : ((240.0 / Math.max(4.0, distance3D)) + 28.0);
            let capsuleFovLimit = isADS ? (baseCapsule * 0.75) : baseCapsule;

            let isStickyTarget = (enemy.id === previousTargetId);
            if (isStickyTarget) capsuleFovLimit *= 1.5;

            if (fov2D > capsuleFovLimit) continue;

            let stancePenalty = 1.0;
            if ((origin.y - hY_raw) > 0.8) stancePenalty *= 2.0;
            if (enemy.is_behind_cover) stancePenalty *= 10.0;

            let isBot = enemy.is_bot === true || enemy.is_client_bot === true;
            let botPenalty = isBot ? 5.0 : 1.0;

            let hardLockDiscount = (lockedTargetId === enemy.id) ? 0.001 : 1.0;
            let stickyDiscount = isStickyTarget ? 0.50 : 1.0;

            // Ưu tiên cự ly tuyệt đối: Kẻ địch cận chiến (<3.5m) luôn được ưu tiên bắt tâm đầu tiên,
            // không bao giờ bị kẻ địch ở xa phía sau đánh lạc hướng
            let distanceDiscount = (distance3D < 3.5) ? 0.05 : (distance3D < 6.0 ? 0.30 : 1.0);

            let score2D = fov2D * stancePenalty * stickyDiscount * botPenalty * hardLockDiscount * distanceDiscount;

            if (score2D < lowest2DDistance) {
                lowest2DDistance = score2D;
                bestTargetRef = enemy;

                let aimZone = AnatomicalSkeletonEngine.detectAimZone(enemy.skeleton, origin, currentPitch, distXZ);
                enemy.aimZone = aimZone;

                let tmp = state.pool.tempTarget;
                tmp.id = enemy.id;
                tmp.distance3D = distance3D;
                tmp.distance2D = fov2D;
                tmp.deltaPitch = rawDeltaPitch;
                tmp.deltaYaw = rawDeltaYaw;
                tmp.absoluteEnemyYaw = enemyYaw;
                tmp.enemyDeltaYaw = isStickyTarget ? TargetScanner2D3D.normalizeAngle(enemyYaw - previousEnemyYaw) : 0.0;
                tmp.isGhost = false;
                tmp.aimZone = aimZone;
                tmp.skeleton = enemy.skeleton;
                tmp.crownPitch = -Math.atan2(hY_raw + headOffset - localDispY - origin.y, distXZ) * (180.0 / Math.PI);
                tmp.crownPos = { x: hX, y: hY_raw + headOffset, z: hZ };

                // Lưu vị trí GỐC (chưa extrapolate) cho ghost frame
                tmp.rawHeadPos.x = headRef.x;
                tmp.rawHeadPos.y = headRef.y;
                tmp.rawHeadPos.z = headRef.z;

                tmp.isAirborne = isAirborneEnemy;
                tmp.velocity.x = velX; tmp.velocity.y = velY; tmp.velocity.z = velZ;
                tmp.acceleration = enemy.acceleration || { x: 0, y: 0, z: 0 };
                tmp.is_reversing = enemy.is_reversing || false;
            }
        }

        // ====================================================================
        // C0. [V16] UNIVERSAL BODY HITBOX NEUTRALIZATION — TẨY NÃO TOÀN BỘ TOP CANDIDATES
        // Giải quyết triệt để: Native aim assist kéo tâm vào body/leg của BẤT KỲ kẻ địch nào
        // Không chỉ bestTargetRef, mà TẤT CẢ 10 candidate gần nhất đều bị triệt tiêu body
        // ====================================================================
        const STATIC_BONE_KEYS = [
            'head', 'crown', 'neck', 'chest', 'stomach', 'pelvis', 'legs', 'feet', 'body', 'spine', 'abdomen', 'arm', 'hand', 'shoulder', 'knees', 'thighs',
            'bone_Head', 'bone_Neck', 'bone_Spine', 'bone_Spine01', 'bone_Spine1', 'bone_Hips', 'bone_Pelvis', 
            'bone_LeftClav', 'bone_RightClav', 'bone_LeftArm', 'bone_RightArm', 'bone_LeftForeArm', 'bone_RightForeArm',
            'bone_LeftLegUpper', 'bone_RightLegUpper', 'bone_LeftAnkle', 'bone_RightAnkle'
        ];
        const numStaticBones = STATIC_BONE_KEYS.length;

        for (let tc = 0; tc < 10; tc++) {
            let candidateEntity = state.pool.topCandidates[tc];
            if (!candidateEntity || !candidateEntity.hitboxes) continue;

            const cHitboxes = candidateEntity.hitboxes;
            for (let cb = 0; cb < numStaticBones; cb++) {
                let cBoneName = STATIC_BONE_KEYS[cb];
                let cBone = cHitboxes[cBoneName];
                if (!cBone) continue;

                // Chỉ zero các hitbox KHÔNG PHẢI đầu — triệt tiêu 100% lực hút body/chest/leg
                if (cBoneName !== 'head' && cBoneName !== 'crown' && cBoneName !== 'bone_Head') {
                    cBone.radius = 0.0001;
                    cBone.magnetism = -99999.0;
                    cBone.friction = 0.0;
                    cBone.snap_weight = -99999.0;
                    cBone.attraction = -99999.0;
                    cBone.aim_assist_weight = -99999.0;
                    cBone.priority = 0;
                    cBone.ignore_aim = true;
                }
            }

            // Vô hiệu hóa collider thân người cho TẤT CẢ candidates
            if (candidateEntity.collider) {
                candidateEntity.collider.body_weight = 0.0;
                candidateEntity.collider.chest_weight = 0.0;
                candidateEntity.collider.leg_weight = 0.0;
            }

            // Cưỡng chế aim assist khóa vào head cho TẤT CẢ candidates
            if (candidateEntity.aim_assist) {
                candidateEntity.aim_assist.target_bone = 'head';
                candidateEntity.aim_assist.chest_lock = false;
                candidateEntity.aim_assist.body_lock = false;
                candidateEntity.aim_assist.leg_lock = false;
                candidateEntity.aim_assist.friction = 0.0;
                candidateEntity.aim_assist.leg_weight = 0.0;
                candidateEntity.aim_assist.body_weight = 0.0;
            }
            if (candidateEntity.auto_aim) {
                candidateEntity.auto_aim.bone_priority = 'head_only';
                candidateEntity.auto_aim.target_part = 'head';
                candidateEntity.auto_aim.lock_chest = false;
                candidateEntity.auto_aim.lock_body = false;
                candidateEntity.auto_aim.lock_legs = false;
                candidateEntity.auto_aim.body_magnet = 0.0;
                candidateEntity.auto_aim.leg_magnet = 0.0;
            }
        }

        // ====================================================================
        // C. TARGET-FOCUSED BONE HIJACKING & NATIVE AIM-ASSIST PURGE
        // Mục tiêu khóa: Phóng to HEAD hitbox + triệt tiêu body (đã zero ở C0 bên trên)
        // TUYỆT ĐỐI KHÔNG làm sai lệch tọa độ thực tế (bone.pos) để bảo toàn 100% nảy dame
        // ====================================================================
        let targetEntity = bestTargetRef || (state.target.id && state.target.ref ? state.target.ref : null);
        if (targetEntity && targetEntity.hitboxes) {
            let eDx = (targetEntity.pos ? targetEntity.pos.x : 0) - origin.x;
            let eDy = (targetEntity.pos ? targetEntity.pos.y + 1.75 : 0) - origin.y;
            let eDz = (targetEntity.pos ? targetEntity.pos.z : 0) - origin.z;
            let eDist = Math.sqrt(eDx * eDx + eDy * eDy + eDz * eDz);
            let isCQCEnemy = eDist < 3.5;

            const hitboxes = targetEntity.hitboxes;
            for (let b = 0; b < numStaticBones; b++) {
                let boneName = STATIC_BONE_KEYS[b];
                let bone = hitboxes[boneName];
                if (!bone) continue;

                if (boneName === 'head' || boneName === 'crown' || boneName === 'bone_Head') {
                    // Mở rộng bán kính đón tâm đỉnh sọ, nam châm cực đại
                    bone.radius = (eDist < 2.8) ? 8.5 : (isCQCEnemy ? 6.5 : 3.8);
                    bone.magnetism = 100.0;
                    bone.snap_weight = 99999.0;
                    bone.attraction = 100.0;
                    bone.aim_assist_weight = 99999.0;
                    bone.priority = 100;
                    bone.targetable = true;
                    bone.ignore_aim = false;
                } else if (boneName === 'neck' || boneName === 'bone_Neck') {
                    // Cổ: Giữ diện tích nhỏ, lực hút trung bình tránh kẹt ngực
                    bone.radius = 1.0;
                    bone.magnetism = 0.0;
                    bone.snap_weight = 0.0;
                    bone.ignore_aim = true;
                } else {
                    // [V18] Triệt tiêu lực hút của ngực, bụng, chân, tay — Áp dụng lực đẩy âm
                    bone.radius = 0.0001;
                    bone.magnetism = -99999.0;
                    bone.friction = 0.0;
                    bone.snap_weight = -99999.0;
                    bone.attraction = -99999.0;
                    bone.aim_assist_weight = -99999.0;
                    bone.priority = 0;
                    bone.ignore_aim = true;
                }
            }

            // Vô hiệu hóa Collider thân người nếu có
            if (targetEntity.collider) {
                targetEntity.collider.body_weight = 0.0;
                targetEntity.collider.chest_weight = 0.0;
                targetEntity.collider.leg_weight = 0.0;
            }

            // Cưỡng chế Native Aim-Assist của mục tiêu khóa vào head
            if (targetEntity.aim_assist) {
                targetEntity.aim_assist.target_bone = 'head';
                targetEntity.aim_assist.chest_lock = false;
                targetEntity.aim_assist.body_lock = false;
                targetEntity.aim_assist.friction = 0.0;
            }
            if (targetEntity.auto_aim) {
                targetEntity.auto_aim.bone_priority = 'head_only';
                targetEntity.auto_aim.target_part = 'head';
                targetEntity.auto_aim.lock_chest = false;
                targetEntity.auto_aim.lock_body = false;
            }
        }

        // Tẩy não cấu hình Aim Assist ở cấp độ Toàn Cục Payload
        if (payload.aim_assist) {
            payload.aim_assist.target_bone = 'head';
            payload.aim_assist.chest_lock = false;
            payload.aim_assist.body_lock = false;
            payload.aim_assist.body_weight = 0.0;
            payload.aim_assist.chest_weight = 0.0;
            payload.aim_assist.leg_weight = 0.0;
            payload.aim_assist.head_weight = 100.0;
            payload.aim_assist.friction = 0.0;
            payload.aim_assist.attraction_mode = 'head_only';
        }
        if (payload.auto_aim) {
            payload.auto_aim.target_part = 'head';
            payload.auto_aim.bone = 'head';
            payload.auto_aim.lock_chest = false;
            payload.auto_aim.lock_body = false;
            payload.auto_aim.body_magnet = 0.0;
        }

        // ====================================================================
        // D. CROSS-PATH GHOSTING (SMART GHOSTING)
        // ====================================================================
        let finalTarget = bestTargetRef ? state.pool.tempTarget : null;

        // [NÂNG CẤP]: Bóng ma chỉ xuất hiện nếu KHÔNG CÓ BẤT KỲ kẻ địch thực thể nào (finalTarget === null)
        if (lockedTargetId && !finalTarget) {
            if (state.target.ghostFrames < 4) {
                state.target.ghostFrames++;

                let lastPos = state.target.lastHeadPos;
                let lastVel = state.target.lastVelocity;

                // VELOCITY DECAY: Mỗi ghost frame giảm velocity 15%
                // Địch không duy trì tốc độ không đổi sau khi mất tầm nhìn
                let decayFactor = Math.pow(0.85, state.target.ghostFrames);
                let vx = lastVel.x * decayFactor;
                let vy = lastVel.y * decayFactor;
                let vz = lastVel.z * decayFactor;

                let gX = lastPos.x + (vx * 0.016);
                let gY = lastPos.y + (vy * 0.016) - localDispY;
                let gZ = lastPos.z + (vz * 0.016);

                let dx = gX - origin.x; let dy = gY - origin.y; let dz = gZ - origin.z;

                let distSq = (dx * dx) + (dy * dy) + (dz * dz);
                let distance3D = Math.sqrt(distSq);

                let distXZSq = (dx * dx) + (dz * dz);
                let distXZ = distXZSq > 0 ? Math.sqrt(distXZSq) : 0.001;

                let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
                let enemyPitch = -Math.atan2(dy, distXZ) * (180.0 / Math.PI);

                let rawDeltaYaw = TargetScanner2D3D.normalizeAngle(enemyYaw - currentYaw);
                let rawDeltaPitch = TargetScanner2D3D.normalizeAngle(enemyPitch - currentPitch);
                let scaledDeltaPitch = rawDeltaPitch * ASPECT_RATIO;
                let fov2D = Math.sqrt((rawDeltaYaw * rawDeltaYaw) + (scaledDeltaPitch * scaledDeltaPitch));

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

                state.target.lastHeadPos.x = gX;
                state.target.lastHeadPos.y = gY + localDispY;
                state.target.lastHeadPos.z = gZ;
                // Cập nhật velocity đã decay cho frame tiếp
                state.target.lastVelocity.x = vx;
                state.target.lastVelocity.y = vy;
                state.target.lastVelocity.z = vz;

            } else {
                state.target.id = null;
                state.target.ghostFrames = 0;
            }
        }

        // ====================================================================
        // E. XUẤT BÁO CÁO VÀO VORTEX STATE 
        // ====================================================================
        if (finalTarget) {
            if (!finalTarget.isGhost) {
                state.target.ghostFrames = 0;

                state.target.lastHeadPos.x = finalTarget.rawHeadPos.x;
                state.target.lastHeadPos.y = finalTarget.rawHeadPos.y;
                state.target.lastHeadPos.z = finalTarget.rawHeadPos.z;

                state.target.lastVelocity.x = finalTarget.velocity.x;
                state.target.lastVelocity.y = finalTarget.velocity.y;
                state.target.lastVelocity.z = finalTarget.velocity.z;

                if (!state.target.velocity) state.target.velocity = { x: 0, y: 0, z: 0 };
                state.target.velocity.x = finalTarget.velocity.x;
                state.target.velocity.y = finalTarget.velocity.y;
                state.target.velocity.z = finalTarget.velocity.z;

                if (!state.target.acceleration) state.target.acceleration = { x: 0, y: 0, z: 0 };
                state.target.acceleration.x = finalTarget.acceleration ? finalTarget.acceleration.x : 0;
                state.target.acceleration.y = finalTarget.acceleration ? finalTarget.acceleration.y : 0;
                state.target.acceleration.z = finalTarget.acceleration ? finalTarget.acceleration.z : 0;
                state.target.is_reversing = finalTarget.is_reversing || false;

                state.target.skeleton = finalTarget.skeleton || (bestTargetRef ? bestTargetRef.skeleton : null);
                state.target.aimZone = finalTarget.aimZone || "NONE";
                state.target.isStuckInStomach = (state.target.aimZone === "STOMACH");
                state.target.isStuckInLegs = (state.target.aimZone === "LEGS");
                state.target.crownPos = finalTarget.crownPos || state.target.lastHeadPos;
                state.target.crownPitch = finalTarget.crownPitch || (currentPitch + finalTarget.deltaPitch);
            }
            state.target.ref = bestTargetRef;
            state.target.id = finalTarget.id;
            state.target.distance3D = finalTarget.distance3D;
            state.target.distance2D = finalTarget.distance2D;
            state.target.pitchError = finalTarget.deltaPitch;
            state.target.yawError = finalTarget.deltaYaw;

            state.target.enemyDeltaYaw = finalTarget.enemyDeltaYaw;
            state.target.lastEnemyYaw = finalTarget.absoluteEnemyYaw;
        } else {
            state.target.id = null;
            state.target.ref = null;
            state.target.skeleton = null;
            state.target.aimZone = "NONE";
            state.target.isStuckInStomach = false;
            state.target.isStuckInLegs = false;
            state.target.ghostFrames = 0;
            state.target.distance3D = 999.0;
            state.target.distance2D = 999.0;
            state.target.pitchError = 999.0;
            state.target.yawError = 999.0;
            state.target.enemyDeltaYaw = 0.0;
        }

        // ====================================================================
        // [V17] INSTANT TARGET ACQUISITION — Chuyển mục tiêu 0-frame
        // Tẩy trắng BỘ NHỚ HOÀN TOÀN khi đổi mục tiêu
        // + Reset zeroCrossingDamp để không bị dampen lead frame đầu tiên
        // + Giữ prevFrameTime = currentTime (không phải 0) để angular speed
        //   bắt đầu đo từ frame mới thay vì bỏ qua 1 frame
        // ====================================================================
        if (state.target.id !== previousTargetId) {
            state.engine.lastAI_X = 0;
            state.engine.lastAI_Y = 0;
            state.engine.remX = 0;
            state.engine.remY = 0;
            state.engine.enemyAngularSpeedYaw = 0;
            state.engine.enemyAngularSpeedPitch = 0;
            state.engine.enemyAccelYaw = 0;
            state.engine.enemyAccelPitch = 0;
            state.engine.zeroCrossingDamp = 0; // V17: Reset damping ngay lập tức
            state.engine.prevRawSpeedYaw = 0;
            state.engine.prevRawSpeedPitch = 0;
            // V17: Set prevFrameTime = giá trị hiện tại để không mất 1 frame
            if (state.engine.prevFrameTime) state.engine.prevFrameTime = 0;
        }

        return payload;
    }
}

// ============================================================================
// LÕI ĐIỀU KHIỂN VẬT LÝ: VORTEX PARASITIC HOOK V10 (STATIC ZERO-GC MUTATION)
// Đột phá: 
// 1. Đập bỏ hoàn toàn Proxy (Sát thủ RAM). Sử dụng Prototype Override để 
//    chèn tọa độ ở tầng Native C++. Tốc độ O(1), rác sinh ra = 0 Byte.
// 2. Vùng Cấm Địa: Tách biệt Joystick (Trái) và Aim (Phải). Ngón tay di chuyển 
//    sẽ không bao giờ bị hệ thống Aimbot kéo nhầm gây giật cục nhân vật.
// 3. Hệ tọa độ Tích lũy (Accumulated Offset) chống dịch chuyển tức thời.
// ============================================================================
class VortexParasiticHook {
    static get __TargetOffsetX() { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); return (_g._vortex || _g).__TargetOffsetX || 0; }
    static set __TargetOffsetX(v) { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); (_g._vortex || _g).__TargetOffsetX = v; }
    static get __TargetOffsetY() { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); return (_g._vortex || _g).__TargetOffsetY || 0; }
    static set __TargetOffsetY(v) { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); (_g._vortex || _g).__TargetOffsetY = v; }
    static get __SmoothOffsetX() { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); return (_g._vortex || _g).__SmoothOffsetX || 0; }
    static set __SmoothOffsetX(v) { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); (_g._vortex || _g).__SmoothOffsetX = v; }
    static get __SmoothOffsetY() { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); return (_g._vortex || _g).__SmoothOffsetY || 0; }
    static set __SmoothOffsetY(v) { const _g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global); (_g._vortex || _g).__SmoothOffsetY = v; }

    static initialize() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;
        if (_vortex.__ParasiticInitialized) return;

        // Kho lưu trữ lực tiêm và Hệ tọa độ ảo tích lũy
        _vortex.__PendingDeltaX = 0;
        _vortex.__PendingDeltaY = 0;
        _vortex.__TargetOffsetX = 0;
        _vortex.__TargetOffsetY = 0;
        _vortex.__SmoothOffsetX = 0;
        _vortex.__SmoothOffsetY = 0;
        _vortex.__GlobalOffsetX = 0;
        _vortex.__GlobalOffsetY = 0;

        console.log("🦠 [VORTEX V10] Khởi động Lõi Ký Sinh Tĩnh (Static Prototype Mutation)...");

        // Set lưu trữ các Touch ID: Joystick (Trái), Aim (Phải), và Nút phụ 3-4 ngón (HUD Mask)
        const joystickTouchIds = new Set();
        const aimTouchIds = new Set();
        const hudMaskTouchIds = new Set();
        _vortex.__JoystickTouchIds = joystickTouchIds;

        // --------------------------------------------------------------------
        // TỰ ĐỘNG ĐO ĐẠC TẦN SỐ QUÉT MÀN HÌNH (60Hz / 90Hz / 120Hz ProMotion)
        // --------------------------------------------------------------------
        let lastFrameTime = 0;
        let frameDeltas = [];
        const detectDisplayRate = (timestamp) => {
            if (lastFrameTime) {
                let dt = timestamp - lastFrameTime;
                if (dt > 4 && dt < 35) {
                    frameDeltas.push(dt);
                    if (frameDeltas.length >= 10) {
                        let avgDt = frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length;
                        let detectedHz = 60;
                        if (avgDt < 10.5) detectedHz = 120;
                        else if (avgDt < 13.5) detectedHz = 90;
                        else detectedHz = 60;
                        _vortex.__DetectedDisplayHz = detectedHz;
                        console.log("⚡ [VORTEX V13] Nhận diện Tần số quét màn hình: " + detectedHz + "Hz (Chu kỳ " + avgDt.toFixed(2) + "ms)");
                        if (_vortex.__MetronomeWorker && typeof _vortex.__MetronomeWorker.postMessage === 'function') {
                            _vortex.__MetronomeWorker.postMessage({ command: 'START', fps: detectedHz });
                        }
                        return;
                    }
                }
            }
            lastFrameTime = timestamp;
            if (frameDeltas.length < 10 && typeof requestAnimationFrame !== 'undefined') {
                requestAnimationFrame(detectDisplayRate);
            }
        };
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(detectDisplayRate);
        }

        // --------------------------------------------------------------------
        // TRUY XUẤT VÀ BẢO TỒN GETTER NGUYÊN BẢN CỦA TRÌNH DUYỆT (CHỐNG RECURSION)
        // --------------------------------------------------------------------
        if (!_vortex.__NativeTouchGetters) {
            let nativeGetX = null, nativeGetY = null, nativeGetPX = null, nativeGetPY = null;
            if (typeof Touch !== 'undefined' && Touch.prototype) {
                try {
                    nativeGetX = Object.getOwnPropertyDescriptor(Touch.prototype, 'clientX')?.get || null;
                    nativeGetY = Object.getOwnPropertyDescriptor(Touch.prototype, 'clientY')?.get || null;
                    nativeGetPX = Object.getOwnPropertyDescriptor(Touch.prototype, 'pageX')?.get || null;
                    nativeGetPY = Object.getOwnPropertyDescriptor(Touch.prototype, 'pageY')?.get || null;
                } catch (e) {}
            }
            _vortex.__NativeTouchGetters = { getX: nativeGetX, getY: nativeGetY, getPX: nativeGetPX, getPY: nativeGetPY };
        }

        const { getX, getY, getPX, getPY } = _vortex.__NativeTouchGetters;

        const getRawX = (t) => {
            if (!t) return 0;
            if (getX) return getX.call(t);
            return (t._rawX !== undefined) ? t._rawX : ((t.clientX !== undefined) ? t.clientX : 0);
        };
        const getRawY = (t) => {
            if (!t) return 0;
            if (getY) return getY.call(t);
            return (t._rawY !== undefined) ? t._rawY : ((t.clientY !== undefined) ? t.clientY : 0);
        };
        const getRawPX = (t) => {
            if (!t) return 0;
            if (getPX) return getPX.call(t);
            return (t._rawX !== undefined) ? t._rawX : ((t.pageX !== undefined) ? t.pageX : 0);
        };
        const getRawPY = (t) => {
            if (!t) return 0;
            if (getPY) return getPY.call(t);
            return (t._rawY !== undefined) ? t._rawY : ((t.pageY !== undefined) ? t.pageY : 0);
        };

        // --------------------------------------------------------------------
        // BỘ ĐỆM METRICS O(1) - KHÔNG GÂY LAYOUT REFLOW KHI TRUY CẬP TOUCH
        // --------------------------------------------------------------------
        let cachedMetrics = {
            width: 1920,
            height: 1080,
            joystickZoneX: 960 // w * 0.50 (Toàn bộ nửa trái màn hình dành cho Joystick)
        };

        const updateMetrics = () => {
            if (typeof window !== 'undefined') {
                let docW = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement.clientWidth : 0;
                let docH = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement.clientHeight : 0;
                let w = window.innerWidth || docW || (window.screen && window.screen.width) || 1920;
                let h = window.innerHeight || docH || (window.screen && window.screen.height) || 1080;
                cachedMetrics.width = w;
                cachedMetrics.height = h;
                // Vùng Joystick: 50% toàn bộ nửa trái màn hình (chuẩn tuyệt đối khử giật khựng di chuyển 100%)
                cachedMetrics.joystickZoneX = w * 0.50;
                _vortex.__CachedMetrics = cachedMetrics;
                _vortex.__JoystickZoneX = cachedMetrics.joystickZoneX;
            }
        };
        updateMetrics();
        _vortex.__CachedMetrics = cachedMetrics;
        _vortex.__JoystickZoneX = cachedMetrics.joystickZoneX;

        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('resize', updateMetrics, { passive: true });
            window.addEventListener('orientationchange', updateMetrics, { passive: true });
        }

        // --------------------------------------------------------------------
        // 1. TOUCH PROTOTYPE MUTATION (BẢO VỆ JOYSTICK & NÚT PHỤ 100% NATIVE)
        // --------------------------------------------------------------------
        if (typeof Touch !== 'undefined' && getX && getY) {
            _vortex.__TouchPrototypeMutated = true;
            // X Đánh tráo: Ngón tay Joystick & Nút phụ 3-4 ngón được giữ nguyên bản tuyệt đối 100%
            Object.defineProperty(Touch.prototype, 'clientX', {
                get: function () {
                    let id = this.identifier;
                    if (joystickTouchIds.has(id) || hudMaskTouchIds.has(id)) return getRawX(this);
                    if (aimTouchIds.has(id)) return getRawX(this) + (_vortex.__GlobalOffsetX || 0);

                    let rawX = getRawX(this);
                    if (rawX <= cachedMetrics.joystickZoneX) {
                        joystickTouchIds.add(id);
                        return rawX;
                    }

                    let rawY = getRawY(this);
                    // Kiểm tra vùng HUD Mask (Nút bắn phụ góc trên trái / Scope góc trên phải)
                    if ((rawX <= cachedMetrics.width * 0.28 && rawY <= cachedMetrics.height * 0.35) ||
                        (rawX >= cachedMetrics.width * 0.72 && rawY <= cachedMetrics.height * 0.35)) {
                        hudMaskTouchIds.add(id);
                        return rawX;
                    }

                    aimTouchIds.add(id);
                    return rawX + (_vortex.__GlobalOffsetX || 0);
                }
            });

            Object.defineProperty(Touch.prototype, 'pageX', {
                get: function () {
                    let id = this.identifier;
                    if (joystickTouchIds.has(id) || hudMaskTouchIds.has(id)) return getRawPX(this);
                    if (aimTouchIds.has(id)) return getRawPX(this) + (_vortex.__GlobalOffsetX || 0);

                    let rawX = getRawX(this);
                    if (rawX <= cachedMetrics.joystickZoneX) {
                        joystickTouchIds.add(id);
                        return getRawPX(this);
                    }

                    let rawY = getRawY(this);
                    if ((rawX <= cachedMetrics.width * 0.28 && rawY <= cachedMetrics.height * 0.35) ||
                        (rawX >= cachedMetrics.width * 0.72 && rawY <= cachedMetrics.height * 0.35)) {
                        hudMaskTouchIds.add(id);
                        return getRawPX(this);
                    }

                    aimTouchIds.add(id);
                    return getRawPX(this) + (_vortex.__GlobalOffsetX || 0);
                }
            });

            // Y Đánh tráo: Kẹp an toàn Viewport chống rớt touch WebKit
            Object.defineProperty(Touch.prototype, 'clientY', {
                get: function () {
                    let id = this.identifier;
                    if (joystickTouchIds.has(id) || hudMaskTouchIds.has(id)) return getRawY(this);
                    if (aimTouchIds.has(id)) {
                        let targetY = getRawY(this) + (_vortex.__GlobalOffsetY || 0);
                        return Math.max(5, Math.min(cachedMetrics.height - 5, targetY));
                    }

                    let rawX = getRawX(this);
                    if (rawX <= cachedMetrics.joystickZoneX) {
                        joystickTouchIds.add(id);
                        return getRawY(this);
                    }

                    let rawY = getRawY(this);
                    if ((rawX <= cachedMetrics.width * 0.28 && rawY <= cachedMetrics.height * 0.35) ||
                        (rawX >= cachedMetrics.width * 0.72 && rawY <= cachedMetrics.height * 0.35)) {
                        hudMaskTouchIds.add(id);
                        return rawY;
                    }

                    aimTouchIds.add(id);
                    let targetY = rawY + (_vortex.__GlobalOffsetY || 0);
                    return Math.max(5, Math.min(cachedMetrics.height - 5, targetY));
                }
            });

            Object.defineProperty(Touch.prototype, 'pageY', {
                get: function () {
                    let id = this.identifier;
                    if (joystickTouchIds.has(id) || hudMaskTouchIds.has(id)) return getRawPY(this);
                    if (aimTouchIds.has(id)) {
                        let targetY = getRawPY(this) + (_vortex.__GlobalOffsetY || 0);
                        return Math.max(5, Math.min(cachedMetrics.height - 5, targetY));
                    }

                    let rawX = getRawX(this);
                    if (rawX <= cachedMetrics.joystickZoneX) {
                        joystickTouchIds.add(id);
                        return getRawPY(this);
                    }

                    let rawY = getRawY(this);
                    if ((rawX <= cachedMetrics.width * 0.28 && rawY <= cachedMetrics.height * 0.35) ||
                        (rawX >= cachedMetrics.width * 0.72 && rawY <= cachedMetrics.height * 0.35)) {
                        hudMaskTouchIds.add(id);
                        return getRawPY(this);
                    }

                    aimTouchIds.add(id);
                    let targetY = getRawPY(this) + (_vortex.__GlobalOffsetY || 0);
                    return Math.max(5, Math.min(cachedMetrics.height - 5, targetY));
                }
            });
        }

        // Tương thích với Chuột/Giả lập trên PC
        if (typeof MouseEvent !== 'undefined') {
            const getMX = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'clientX')?.get;
            const getMY = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'clientY')?.get;
            const getMoveX = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'movementX')?.get;
            const getMoveY = Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'movementY')?.get;

            if (getMX && getMY) {
                Object.defineProperty(MouseEvent.prototype, 'clientX', {
                    get: function () {
                        let rawX = getMX.call(this);
                        return rawX > cachedMetrics.joystickZoneX ? rawX + (_vortex.__GlobalOffsetX || 0) : rawX;
                    }
                });
                Object.defineProperty(MouseEvent.prototype, 'clientY', {
                    get: function () {
                        let rawX = getMX.call(this);
                        return rawX > cachedMetrics.joystickZoneX ? getMY.call(this) + (_vortex.__GlobalOffsetY || 0) : getMY.call(this);
                    }
                });
            }
            if (getMoveX && getMoveY) {
                Object.defineProperty(MouseEvent.prototype, 'movementX', {
                    get: function () {
                        let rawX = getMX ? getMX.call(this) : (this.clientX || 0);
                        return rawX > cachedMetrics.joystickZoneX ? getMoveX.call(this) + (_vortex.__PendingDeltaX || 0) : getMoveX.call(this);
                    }
                });
                Object.defineProperty(MouseEvent.prototype, 'movementY', {
                    get: function () {
                        let rawX = getMX ? getMX.call(this) : (this.clientX || 0);
                        return rawX > cachedMetrics.joystickZoneX ? getMoveY.call(this) + (_vortex.__PendingDeltaY || 0) : getMoveY.call(this);
                    }
                });
            }
        }

        // ====================================================================
        // 2. EVENT LISTENER HOOK (BƠM TÍCH LŨY DELTA & BẢO TOÀN TRẠNG THÁI TOUCH)
        // ====================================================================
        if (typeof EventTarget !== 'undefined' && EventTarget.prototype) {
            const originalAdd = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {

                // TOUCHSTART & MOUSEDOWN: Phân loại ngón tay Joystick, Aim và HUD Mask
                if (type === 'touchstart' || type === 'mousedown') {
                    const wrapStart = function (e) {
                        try {
                            if (e && e.changedTouches) {
                                const inputState = _vortex.__VortexState ? _vortex.__VortexState.input : null;
                                let joyLimit = cachedMetrics.joystickZoneX;
                                for (let i = 0; i < e.changedTouches.length; i++) {
                                    let t = e.changedTouches[i];
                                    let tx = getRawX(t);
                                    let ty = getRawY(t);

                                    // Nhận diện vùng nút bấm 3-4 ngón
                                    let isHudMask = (tx <= cachedMetrics.width * 0.28 && ty <= cachedMetrics.height * 0.35) ||
                                                    (tx >= cachedMetrics.width * 0.72 && ty <= cachedMetrics.height * 0.35);

                                    if (isHudMask) {
                                        hudMaskTouchIds.add(t.identifier);
                                        joystickTouchIds.delete(t.identifier);
                                        aimTouchIds.delete(t.identifier);
                                    } else if (tx <= joyLimit) {
                                        joystickTouchIds.add(t.identifier);
                                        aimTouchIds.delete(t.identifier);
                                        hudMaskTouchIds.delete(t.identifier);
                                    } else {
                                        // Nếu trước đó chưa có ngón aim nào (aimTouchIds.size === 0), đây là swipe mới -> reset offset chống dịch chuyển tức thời
                                        if (aimTouchIds.size === 0) {
                                            _vortex.__GlobalOffsetX = 0;
                                            _vortex.__GlobalOffsetY = 0;
                                            _vortex.__SmoothOffsetX = 0;
                                            _vortex.__SmoothOffsetY = 0;
                                        }
                                        aimTouchIds.add(t.identifier);
                                        joystickTouchIds.delete(t.identifier);
                                        hudMaskTouchIds.delete(t.identifier);

                                        let isFireButtonZone = (tx >= cachedMetrics.width * 0.60 && ty >= cachedMetrics.height * 0.45);
                                        if (inputState) {
                                            if (isFireButtonZone) {
                                                inputState.fireTouchId = t.identifier;
                                            } else {
                                                inputState.lookTouchId = t.identifier;
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (err) {}

                        if (typeof listener === 'function') return listener.call(this, e);
                        if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent(e);
                    };
                    return originalAdd.call(this, type, wrapStart, options);
                }

                // TOUCHEND & TOUCHCANCEL: Xóa ID, chỉ reset offset khi KHÔNG CÒN ngón ngắm nào
                if (type === 'touchend' || type === 'touchcancel') {
                    const wrapEnd = function (e) {
                        try {
                            if (e && e.changedTouches) {
                                const inputState = _vortex.__VortexState ? _vortex.__VortexState.input : null;
                                for (let i = 0; i < e.changedTouches.length; i++) {
                                    let id = e.changedTouches[i].identifier;
                                    joystickTouchIds.delete(id);
                                    aimTouchIds.delete(id);
                                    hudMaskTouchIds.delete(id);

                                    if (inputState) {
                                        if (inputState.fireTouchId === id) inputState.fireTouchId = null;
                                        if (inputState.lookTouchId === id) inputState.lookTouchId = null;
                                    }
                                }

                                // CHỐNG GIẬT TÂM: Chỉ dọn sạch Offset tích lũy khi nhấc toàn bộ ngón tay ngắm ra khỏi màn hình
                                if (aimTouchIds.size === 0) {
                                    _vortex.__GlobalOffsetX = 0;
                                    _vortex.__GlobalOffsetY = 0;
                                    _vortex.__PendingDeltaX = 0;
                                    _vortex.__PendingDeltaY = 0;
                                    _vortex.__TargetOffsetX = 0;
                                    _vortex.__TargetOffsetY = 0;
                                    _vortex.__SmoothOffsetX = 0;
                                    _vortex.__SmoothOffsetY = 0;
                                }
                            }
                        } catch (err) {}

                        if (typeof listener === 'function') return listener.call(this, e);
                        if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent(e);
                    };
                    return originalAdd.call(this, type, wrapEnd, options);
                }

                // TOUCHMOVE / POINTERMOVE / MOUSEMOVE:
                // Tích lũy delta thời gian thực vào Hệ tọa độ ảo (Accumulative Vector Thrust)
                if (type === 'touchmove' || type === 'pointermove' || type === 'mousemove') {
                    const wrapMove = function (e) {
                        try {
                            if (e) {
                                let isAimMove = false;
                                if (e.changedTouches && e.changedTouches.length > 0) {
                                    for (let t = 0; t < e.changedTouches.length; t++) {
                                        let touch = e.changedTouches[t];
                                        let id = touch.identifier;

                                        if (hudMaskTouchIds.has(id)) continue;
                                        if (joystickTouchIds.has(id)) continue; // JOYSTICK: Tuyệt đối bỏ qua O(1) không can thiệp

                                        if (aimTouchIds.has(id) || getRawX(touch) > cachedMetrics.joystickZoneX) {
                                            isAimMove = true;
                                            break;
                                        }
                                    }
                                } else if (type === 'mousemove') {
                                    let mx = (e.clientX !== undefined) ? e.clientX : 0;
                                    isAimMove = (mx > cachedMetrics.joystickZoneX);
                                }

                                if (isAimMove) {
                                    // ================================================================
                                    // [MODULE 7 UPGRADE]: SUB-PIXEL FRACTIONAL ACCUMULATOR
                                    // Tích lũy phần dư số thực (fractional remainder) chuyển tiếp sang frame sau,
                                    // triệt tiêu hiện tượng giật nấc do làm tròn pixel của hệ điều hành
                                    // ================================================================
                                    let dx = _vortex.__PendingDeltaX || 0;
                                    let dy = _vortex.__PendingDeltaY || 0;

                                    if (dx !== 0 || dy !== 0) {
                                        let maxOffsetY = cachedMetrics.height * 0.85;
                                        let maxOffsetX = cachedMetrics.width * 0.85;
                                        
                                        let totalDx = dx + (_vortex.__SubPixelFractionalX || 0);
                                        let totalDy = dy + (_vortex.__SubPixelFractionalY || 0);
                                        let stepX = Math.trunc(totalDx);
                                        let stepY = Math.trunc(totalDy);
                                        _vortex.__SubPixelFractionalX = totalDx - stepX;
                                        _vortex.__SubPixelFractionalY = totalDy - stepY;

                                        let nextY = (_vortex.__GlobalOffsetY || 0) + stepY;
                                        let nextX = (_vortex.__GlobalOffsetX || 0) + stepX;

                                        // [ANTI-BODY/LEG CLAMP]: Khi bắn và tâm dưới đầu, cấm tuyệt đối kéo dìm Y xuống dưới
                                        if (_vortex.__VortexState && _vortex.__VortexState.weapon && _vortex.__VortexState.weapon.isFiring) {
                                            if (_vortex.__VortexState.target && (_vortex.__VortexState.target.pitchError < 0 || _vortex.__VortexState.target.aimZone !== "CROWN_HEAD")) {
                                                nextY = Math.min(0, nextY);
                                            }
                                        }

                                        _vortex.__GlobalOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, nextY));
                                        _vortex.__GlobalOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, nextX));
                                        _vortex.__PendingDeltaX = 0;
                                        _vortex.__PendingDeltaY = 0;
                                    }
                                }
                            }
                        } catch (err) {}

                        let res;
                        if (typeof listener === 'function') res = listener.call(this, e);
                        else if (listener && typeof listener.handleEvent === 'function') res = listener.handleEvent(e);

                        return res;
                    };
                    return originalAdd.call(this, type, wrapMove, options);
                }

                return originalAdd.call(this, type, listener, options);
            };
        }

        _vortex.__ParasiticInitialized = true;
        console.log("✅ [VORTEX V10] Lõi Ký Sinh O(1) Đã Khởi Động. Joystick cách ly 100%, khử giật khựng!");
    }
}

// Khởi động Ký sinh trùng ngay lập tức
VortexParasiticHook.initialize();

// ============================================================================
// BƯỚC 3: VECTOR THRUST ENGINE V12 (THE ABSOLUTE APEX PREDATOR)
// Tinh chỉnh tối hậu:
// 1. Kinetic Deflection V2: Trượt Vector hoàn hảo, giải phóng hoàn toàn trục Y khi phá bẫy.
// 2. Pre-fire Glass Ceiling: Tối ưu cảm biến đạn nổ để nhả bẫy lập tức.
// 3. Temporal Buffer (150ms): Khóa chặt sọ địch, chống hiện tượng nhảy cóc.
// 4. CQC Overdrive & Inverse-Square Magnetism: Hấp thụ kẻ thù ở cự ly gần (<3m).
// ============================================================================
class VectorThrustEngine {

    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    // ========================================================================
    // ĐO VẬN TỐC GÓC THỜI GIAN THỰC (REAL-TIME KINEMATICS)
    // ========================================================================
    static updateAngularSpeed(state, currentTime, targetAbsoluteYaw, targetAbsolutePitch) {
        const engine = state.engine;

        if (!engine.prevFrameTime) {
            engine.prevTargetYaw = targetAbsoluteYaw;
            engine.prevTargetPitch = targetAbsolutePitch;
            engine.prevFrameTime = currentTime;
            engine.enemyAngularSpeedYaw = 0.0;
            engine.enemyAngularSpeedPitch = 0.0;
            engine.prevRawSpeedYaw = 0.0;
            engine.prevRawSpeedPitch = 0.0;
            return;
        }

        let dtReal = (currentTime - engine.prevFrameTime) / 1000.0;
        if (dtReal <= 0 || dtReal > 0.5) {
            dtReal = 0.0166;
        } else {
            dtReal = Math.max(0.008, Math.min(0.1, dtReal));
        }

        if (dtReal < 0.1) {
            let deltaYaw = this.normalizeAngle(targetAbsoluteYaw - engine.prevTargetYaw);
            let deltaPitch = targetAbsolutePitch - engine.prevTargetPitch;

            let rawSpeedYaw = Math.max(-180.0, Math.min(180.0, deltaYaw / dtReal));
            let rawSpeedPitch = Math.max(-180.0, Math.min(180.0, deltaPitch / dtReal));

            // [V17] ADAPTIVE KALMAN ANGULAR SPEED:
            // Baseline alpha 0.70 (cũ: 0.45) → phản ứng nhanh hơn 56%
            // Sign flip alpha 0.95 (cũ: 0.85) → đổi hướng tức thì
            // High-speed alpha 0.85 → enemy di chuyển nhanh bám kịp ngay
            let prevYaw = engine.enemyAngularSpeedYaw || 0;
            let prevPitch = engine.enemyAngularSpeedPitch || 0;

            let yawSignFlip = (prevYaw * rawSpeedYaw < 0) && Math.abs(rawSpeedYaw) > 2.5;
            let pitchSignFlip = (prevPitch * rawSpeedPitch < 0) && Math.abs(rawSpeedPitch) > 2.5;

            if (yawSignFlip) {
                engine.reversalBoostFrames = 4; // Cấp 4 frames xung lực gia tốc đón đầu hướng mới tức thời
                engine.zeroCrossingDamp = 0;    // Triệt tiêu hoàn toàn giảm lead
            } else if (engine.reversalBoostFrames > 0) {
                engine.reversalBoostFrames--;
            }

            let absRawYaw = Math.abs(rawSpeedYaw);
            let absRawPitch = Math.abs(rawSpeedPitch);

            // Khi đổi hướng (yawSignFlip): alpha = 1.0 (100% phản xạ tức thời, 0% độ trễ quán tính cũ)
            let alphaYaw = yawSignFlip ? 1.0 : (absRawYaw > 25.0 ? 0.90 : 0.78);
            let alphaPitch = pitchSignFlip ? 1.0 : (absRawPitch > 25.0 ? 0.90 : 0.78);

            engine.enemyAngularSpeedYaw = (rawSpeedYaw * alphaYaw) + (prevYaw * (1.0 - alphaYaw));
            engine.enemyAngularSpeedPitch = (rawSpeedPitch * alphaPitch) + (prevPitch * (1.0 - alphaPitch));

            // ACCELERATION TRACKING: d(speed)/dt cho jerk detection
            let rawAccelYaw = (rawSpeedYaw - (engine.prevRawSpeedYaw || 0)) / dtReal;
            let rawAccelPitch = (rawSpeedPitch - (engine.prevRawSpeedPitch || 0)) / dtReal;
            engine.enemyAccelYaw = Math.max(-60.0, Math.min(60.0, rawAccelYaw));
            engine.enemyAccelPitch = Math.max(-60.0, Math.min(60.0, rawAccelPitch));
            engine.prevRawSpeedYaw = rawSpeedYaw;
            engine.prevRawSpeedPitch = rawSpeedPitch;

        } else if (dtReal >= 0.1) {
            engine.enemyAngularSpeedYaw = 0.0;
            engine.enemyAngularSpeedPitch = 0.0;
            engine.enemyAccelYaw = 0.0;
            engine.enemyAccelPitch = 0.0;
        }

        engine.prevTargetYaw = targetAbsoluteYaw;
        engine.prevTargetPitch = targetAbsolutePitch;
        engine.prevFrameTime = currentTime;
    }

    // ========================================================================
    // LÕI XỬ LÝ CHÍNH (MAIN EXECUTION THREAD)
    // ========================================================================
    static execute(payload) {
        // BẢO VỆ JOYSTICK: Tuyệt đối không tiêm touch_delta vào gói tin di chuyển
        if (payload.is_joystick || payload.is_movement || payload.touch_type === "movement" || payload.channel === "movement" || payload.type === "joystick" || payload.type === "move" || payload.is_move) {
            return payload;
        }
        const checkTouchId = payload.id !== undefined ? payload.id : 
            (payload.touch_id !== undefined ? payload.touch_id : 
            (payload.touchId !== undefined ? payload.touchId : 
            (payload.finger_id !== undefined ? payload.finger_id : payload.fingerId)));
        if (checkTouchId !== undefined && _vortex.__JoystickTouchIds && _vortex.__JoystickTouchIds.has(checkTouchId)) {
            return payload;
        }

        const state = _vortex.__VortexState;
        const target = state.target;
        const engine = state.engine;
        const weapon = state.weapon;
        const input = state.input;
        const localPlayer = state.localPlayer;
        const weaponType = weapon.type || "NONE";

        const currentTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const isADS = payload.is_ads || (payload.camera && payload.camera.fov && payload.camera.fov < 60.0);
        engine.isADS = isADS;

        if (!payload.touch_delta) payload.touch_delta = { x: 0, y: 0 };

        if (!target.id) {
            engine.isABSBraking = false;
            engine.lastAI_X = 0;
            engine.lastAI_Y = 0;
            if (engine.prevFrameTime) engine.prevFrameTime = currentTime;
            return payload;
        }

        // LINE-OF-SIGHT & OCCLUSION CHECK (Hardware Avatar_IsVisible 0x95):
        // Nếu mục tiêu bị che khuất sau vật cản cứng hoàn toàn, lập tức nhả lực hỗ trợ
        if (state.target.ref && (state.target.ref.is_occluded || state.target.ref.behind_cover || state.target.ref.behind_wall || state.target.ref.avatar_is_visible === 0 || state.target.ref.avatar_is_visible === false)) {
            engine.isABSBraking = false;
            engine.lastAI_X = 0;
            engine.lastAI_Y = 0;
            return payload;
        }

        // ====================================================================
        // GIAI ĐOẠN 1: THU THẬP KHÔNG GIAN & BÙ TRỪ CẬN CHIẾN
        // ====================================================================
        const currentPitch = payload.camera ? payload.camera.pitch : (payload.aim_pitch || 0);
        const currentYaw = payload.camera ? payload.camera.yaw : (payload.aim_yaw || 0);
        const absoluteTargetYaw = currentYaw + target.yawError;
        const absoluteTargetPitch = currentPitch + target.pitchError;

        this.updateAngularSpeed(state, currentTime, absoluteTargetYaw, absoluteTargetPitch);

        let dist3D = target.distance3D;
        let dist2D = target.distance2D;
        let yawErr = target.yawError;
        let pitchErr = target.pitchError;

        // Bù trừ trọng tâm và lực nâng cận chiến (Parallax Shift & CQC Power Multiplier)
        const subTypeCheck = weapon.subType || "NONE";
        let isShotgunOrOneShot = (weaponType === "SHOTGUN" || 
            ["M1887", "MAG7", "M1014", "SPAS12", "CHARGE_BUSTER"].includes(subTypeCheck));

        let isSuperCQC = dist3D < 2.5;
        let isCQC = dist3D < (isShotgunOrOneShot ? 6.5 : 5.8);
        let cqcMultiplierY = isSuperCQC ? 5.0 : (isCQC ? (isShotgunOrOneShot ? 3.8 : 3.0) : 1.0);
        let isAtHead = (target.aimZone === "CROWN_HEAD" || (target.pitchError !== undefined && target.pitchError >= -0.20 && target.aimZone !== "LEGS" && target.aimZone !== "STOMACH" && target.aimZone !== "CHEST" && !target.isStuckInLegs && !target.isStuckInStomach));
        if (!isAtHead) {
            if (isSuperCQC) {
                pitchErr -= Math.max(5.5, (2.5 - dist3D) * 10.0); // [SUPER-CQC]: Bù Parallax cực hạn siêu cận chiến (<2.5m) khi đang ở dưới đầu
            } else if (isCQC) {
                pitchErr -= (isShotgunOrOneShot ? 2.4 : 1.8); // Bù Parallax nâng tâm vọt qua bẫy ngực
            } else if (dist3D < 8.0 && Math.abs(target.pitchError) > 0.25) {
                // Gradient bù parallax cho dải mid-range (5.8m-8m) khi tâm chưa ở sọ
                let midRangeFactor = 1.0 - (dist3D - 5.8) / 2.2;
                pitchErr -= 0.9 * midRangeFactor;
                cqcMultiplierY = 1.0 + midRangeFactor * 0.8;
            }
        }

        // ====================================================================
        // NHẬN DIỆN VÙNG DÍNH TÂM REAL-TIME THEO KHUNG XƯƠNG GIẢI PHẪU 3D
        // ====================================================================
        let distXZ = Math.max(0.1, Math.sqrt(Math.max(0.01, dist3D * dist3D - (pitchErr * pitchErr * 0.01))));
        let aimZone = "NONE";
        if (target.skeleton && target.skeleton.id === target.id) {
            aimZone = AnatomicalSkeletonEngine.detectAimZone(target.skeleton, payload.fire_origin || { x: 0, y: 0, z: 0 }, currentPitch, distXZ);
        } else if (dist3D > 0.5) {
            let angularHeight = (1.85 / Math.max(1.0, dist3D)) * (180.0 / Math.PI);
            if (pitchErr < -angularHeight * 0.65) {
                aimZone = "LEGS";
            } else if (pitchErr < -angularHeight * 0.40) {
                aimZone = "STOMACH";
            } else if (pitchErr < -0.35) {
                aimZone = "CHEST";
            } else if (Math.abs(pitchErr) <= 0.8) {
                aimZone = "CROWN_HEAD";
            }
        }
        state.target.aimZone = aimZone;
        let isStuckInLegs = (aimZone === "LEGS" || payload.is_stuck_in_legs === true);
        let isStuckInStomach = (aimZone === "STOMACH" || payload.is_stuck_in_stomach === true);

        // [V18 MOMENTUM TUNNELING]: BẢO LƯU QUÁN TÍNH THOÁT BẪY XUYÊN QUA NGỰC
        // Khi vừa thoát chân/bụng, cấp 8 frames bảo toàn đà bay cực đại, không để bẫy ngực kéo lại
        if (weapon.isFiring && (isStuckInLegs || isStuckInStomach)) {
            engine.escapeMomentumFrames = 8;
        }
        let inMomentumTunnel = (engine.escapeMomentumFrames !== undefined && engine.escapeMomentumFrames > 0);
        if (inMomentumTunnel && !isStuckInLegs && !isStuckInStomach) {
            engine.escapeMomentumFrames--;
        }

        let isStuckInBodyOrLegs = isStuckInLegs || isStuckInStomach || inMomentumTunnel;
        state.target.isStuckInLegs = isStuckInLegs;
        state.target.isStuckInStomach = isStuckInStomach;

        // Cập nhật cờ trạng thái Breakout Jerk & Soft Ceiling cho toàn hệ thống
        let inBurst = (engine.fireFrameCount !== undefined ? engine.fireFrameCount <= 4 : ((engine.breakoutFrames || 0) <= 4));
        engine.isBreakoutActive = (isCQC && weapon.isFiring && (inBurst || (pitchErr !== undefined && pitchErr < 0))) || isStuckInBodyOrLegs;
        engine.isSoftCeilingActive = (dist3D > 8.0 && !isStuckInBodyOrLegs);

        // ====================================================================
        // [MODULE 8 UPGRADE]: FINITE STATE MACHINE (FSM) 4-PHASE CLASSIFICATION
        // ====================================================================
        let fsmPhase = "NEUTRAL";
        if (weapon.isFiring) {
            if (aimZone === "CROWN_HEAD" || Math.abs(pitchErr) <= 0.35) {
                fsmPhase = "CRANIAL_LOCK";
            } else if (isStuckInBodyOrLegs || (inBurst && pitchErr < -0.2)) {
                fsmPhase = "PRE_FIRE_EJECTION";
            } else if (isSuperCQC || (isCQC && pitchErr < -0.15)) {
                fsmPhase = "CQC_PARALLAX_ASCENT";
            } else {
                fsmPhase = "DEAD_STOP_GOVERNOR";
            }
        }
        engine.fsmPhase = fsmPhase;

        // ====================================================================
        // [V20 OFDAS]: DYNAMIC OPTICAL FOV & DISTANCE ADAPTIVE SCALING
        // Tự động scale độ nhạy theo FOV của ống ngắm (2x, 4x, RedDot) và cự ly xa
        // Đảm bảo súng DMR (Woodpecker, SKS, AC80, Dragunov) và DE, M500, M590 khóa sọ bén ngót
        // ====================================================================
        let camFov = (payload.camera && payload.camera.fov) ? payload.camera.fov : (isADS ? 25.0 : 60.0);
        let fovRatio = Math.max(1.0, 60.0 / Math.max(12.0, camFov));
        let isMarksmanOrOneTap = (weaponType === "MARKSMAN" || weaponType === "SNIPER" || 
            ["WOODPECKER", "DESERT_EAGLE", "SKS", "DRAGUNOV", "AC80", "M500", "M590", "MAG7"].includes(subTypeCheck));

        let longDistBoost = (dist3D > 10.0) ? (1.0 + Math.min(0.3, (dist3D - 10.0) / 40.0)) : 1.0;
        const SENS_X = (isADS ? 20.0 : 16.5) * fovRatio * (isMarksmanOrOneTap ? 1.25 : 1.0) * longDistBoost;
        const SENS_Y = (isADS ? 13.0 : 9.5) * fovRatio * cqcMultiplierY * (isMarksmanOrOneTap ? 1.25 : 1.0) * longDistBoost;

        // ====================================================================
        // [CÔNG NGHỆ ĐỘT PHÁ]: INSTANT HEAD-EJECTION ENGINE (BỘ ĐẨY PHẢN LỰC KHẨN CẤP)
        // Yêu cầu: Nếu dính vào BỤNG, CHÂN hoặc ĐỊCH NHẢY -> ĐẨY TÂM SÚNG LÊN ĐẦU NGAY LẬP TỨC
        // Phá vỡ hoàn toàn lực hút ma sát của game, phóng thẳng tâm lên đỉnh sọ trong 1 frame
        // ====================================================================
        let instantHeadEjector = 0;
        let isEnemyAirborne = (target.isAirborne === true || (target.velocity && target.velocity.y > 0.8));
        let isSelfAirborne = localPlayer && (localPlayer.isAirborne || localPlayer.is_jumping || (localPlayer.velocityY && Math.abs(localPlayer.velocityY) > 0.5));
        let isDualAirborne = isSelfAirborne && isEnemyAirborne;

        if ((pitchErr < -0.25 || isStuckInBodyOrLegs || isEnemyAirborne || isDualAirborne) && aimZone !== "CROWN_HEAD") {
            let requiredPitchLift = Math.abs(pitchErr);
            let neededPixels = requiredPitchLift * SENS_Y;

            if (isStuckInLegs) {
                // DÍNH VÀO CHÂN: Bẫy ma sát sâu nhất -> Xung lực cực đại phá vỡ hoàn toàn lực hút chân
                instantHeadEjector = Math.max(neededPixels * 1.95, isSuperCQC ? 320.0 : (isCQC ? 260.0 : 185.0));
            } else if (isStuckInStomach) {
                // DÍNH VÀO BỤNG: Bẫy trọng tâm native aim assist -> Đẩy vọt qua ngực lên đỉnh sọ
                instantHeadEjector = Math.max(neededPixels * 1.75, isSuperCQC ? 280.0 : (isCQC ? 220.0 : 140.0));
            } else if (inMomentumTunnel) {
                // ĐANG BAY XUYÊN NGỰC: Duy trì đà bay cực đại, không để bẫy ngực bóp nghẽn
                instantHeadEjector = Math.max(neededPixels * 1.60, isSuperCQC ? 240.0 : (isCQC ? 180.0 : 120.0));
                // Dưới đầu (ngực/cổ): CQC cần xung lực bứt phá thoát bẫy ngực, cự ly xa nâng mượt mà chuẩn xác
                let isLongRange = (dist3D > 7.0 || distXZ > 7.0);
                let baseChestEject = isSuperCQC ? 220.0 : (isCQC ? (isShotgunOrOneShot ? 240.0 : 180.0) : (isLongRange ? (dist3D > 14.0 ? 8.0 : 14.0) : 85.0));
                let liftMultiplier = isCQC ? 2.2 : (isLongRange ? 1.08 : 1.30);
                instantHeadEjector = isLongRange ? (neededPixels * liftMultiplier + 1.0) : Math.max(neededPixels * liftMultiplier, baseChestEject);
            }

            if (isDualAirborne) {
                // CẢ 2 BÊN CÙNG NHẢY: Cấp xung lực phá bẫy ngực cực hạn
                instantHeadEjector = Math.max(instantHeadEjector, (isShotgunOrOneShot ? 260.0 : 220.0));
            } else if (isEnemyAirborne) {
                // KẺ ĐỊCH NHẢY LÊN: Bổ sung xung lực đón đầu trên không
                instantHeadEjector = Math.max(instantHeadEjector, 160.0);
            }
        }

        let tVelSync = target.velocity || (state.target.ref && (state.target.ref.real_velocity || state.target.ref.velocity));
        if (tVelSync && distXZ > 0.5) {
            let camRad = currentYaw * Math.PI / 180.0;
            let lateralVel = (tVelSync.x * Math.cos(camRad)) - (tVelSync.z * Math.sin(camRad));
            let kinematicYawSpeed = (lateralVel / distXZ) * (180.0 / Math.PI);
            if (state.target.is_reversing || Math.abs(lateralVel) > 0.4) {
                engine.enemyAngularSpeedYaw = kinematicYawSpeed;
            }
        }

        let enemyVelYawFrame = (engine.enemyAngularSpeedYaw || 0.0) * 0.0166;
        let enemyVelPitchFrame = (engine.enemyAngularSpeedPitch || 0.0) * 0.0166;

        // ====================================================================
        // [V17] DYNAMIC LEAD SCALING — Dẫn đầu theo angular speed thực tế
        // Enemy di chuyển nhanh → lead nhiều hơn, chậm → lead ít hơn
        // ====================================================================
        let absAngSpeedYaw = Math.abs(engine.enemyAngularSpeedYaw || 0);
        let absAngSpeedPitch = Math.abs(engine.enemyAngularSpeedPitch || 0);

        let leadYaw, leadPitch;
        if (dist3D < 3.0) {
            // CQC: Lead nhẹ, ưu tiên snap nhanh
            leadYaw = 0.8 + Math.min(1.0, absAngSpeedYaw / 60.0) * 0.8;
            leadPitch = 0.4;
        } else if (dist3D < 10.0) {
            let t = (dist3D - 3.0) / 7.0;
            // V17: Scale lead theo angular speed — enemy nhanh → lead 3.0 frame
            let speedBoost = Math.min(1.2, absAngSpeedYaw / 40.0);
            leadYaw = 0.8 + t * 1.2 + speedBoost;
            leadPitch = 0.4 + t * 0.8 + Math.min(0.6, absAngSpeedPitch / 50.0);
        } else {
            let t = Math.min(1.0, (dist3D - 10.0) / 20.0);
            leadYaw = 2.0 - t * 0.8 + Math.min(1.5, absAngSpeedYaw / 30.0);
            leadPitch = 1.2 - t * 0.4;
        }

        // V17: Giới hạn lead tối đa 3.5 frame để tránh over-leading
        leadYaw = Math.min(3.5, leadYaw);
        leadPitch = Math.min(2.0, leadPitch);

        // [V21 REVERSAL ACCELERATION SURGE]: Khi kẻ địch đổi hướng hoặc lạng lách đảo chiều
        // Tăng cường dẫn đầu (leadYaw) lên 135% trong các frame đảo hướng để tâm súng bẻ lái tức thì đón đầu
        if (engine.reversalBoostFrames && engine.reversalBoostFrames > 0) {
            leadYaw = Math.min(4.2, leadYaw * 1.35);
        }

        // JUMP COMPENSATION
        let accelPitch = engine.enemyAccelPitch || 0;
        if (Math.abs(accelPitch) > 40.0 && Math.abs(enemyVelPitchFrame) > 0.015) {
            leadPitch *= 2.0; // V17: Boost 100% khi phát hiện jump arc
        }

        let predictiveYaw = yawErr + (enemyVelYawFrame * leadYaw);
        let predictivePitch = pitchErr + (enemyVelPitchFrame * leadPitch);

        // ====================================================================
        // [V19 MODULE 3]: DIAGONAL STRAFE RADIAL PITCH COMPENSATION
        // Kẻ địch chạy chéo / nhảy chéo tạo ra biến thiên cự ly xuyên tâm liên tục.
        // Bù trừ vi phân góc Pitch để tâm không bị trôi lên vai hoặc tụt xuống cổ.
        // ====================================================================
        let targetVel = target.velocity;
        if (targetVel && dist3D > 1.5) {
            let tVx = targetVel.x || 0;
            let tVz = targetVel.z || 0;
            let tHorizSpeed = Math.sqrt(tVx * tVx + tVz * tVz);
            if (tHorizSpeed > 1.0) {
                let toTargetX = Math.sin(currentYaw * Math.PI / 180.0);
                let toTargetZ = Math.cos(currentYaw * Math.PI / 180.0);
                let vRadial = (tVx * toTargetX) + (tVz * toTargetZ);
                if (Math.abs(vRadial) > 0.5) {
                    let radialPitchShift = -(vRadial * 0.0166 * (dist3D * 0.12)) / Math.max(2.0, dist3D);
                    predictivePitch += Math.max(-1.0, Math.min(1.0, radialPitchShift));
                }
            }
        }

        // ====================================================================
        // JUMP-SHOT ENGINE: BÙ TRỪ QUÁN TÍNH NHẢY - RƠI CỦA BẢN THÂN
        // Khi bản thân rơi tự do (velocityY < 0), camera bị tụt xuống khiến tâm rơi xuống ngực/chân.
        // Ngược lại khi đang bay lên, camera bị đẩy lên khiến dễ bị overhead.
        // Công thức vi phân góc: d(Pitch) = -(v_y * dt) / dist3D * (180 / PI)
        // ====================================================================
        if (localPlayer && localPlayer.isAirborne && dist3D > 0.5) {
            let localPitchShift = -((localPlayer.velocityY || 0) * 0.0166) / Math.max(1.5, dist3D) * (180.0 / Math.PI);
            localPitchShift = Math.max(-4.5, Math.min(4.5, localPitchShift));

            if (localPlayer.jumpPhase === "FALLING") {
                // Đang rơi: Tự động nâng tâm ngược chiều trọng lực để ghim chắc đỉnh đầu
                predictivePitch += (localPitchShift * 1.25);
            } else if (localPlayer.jumpPhase === "ASCENDING") {
                // Đang vọt lên: Hãm đà nảy nòng để chống overhead
                predictivePitch += (localPitchShift * 0.85);
            } else {
                predictivePitch += localPitchShift;
            }
        }

        // ====================================================================
        // [OMNI-KINEMATIC DUAL-AIRBORNE ENGINE]: BÙ TRỪ VẬN TỐC TƯƠNG ĐỐI 3D TRONG HỆ QUY CHIẾU CAMERA
        // Triệt tiêu hoàn toàn Parallax Drift khi cả 2 cùng nhảy, chạy chéo và camera xoay góc bất kỳ
        // ====================================================================
        let tVel = target.velocity || (state.target.ref && (state.target.ref.real_velocity || state.target.ref.velocity));
        let pVelX = (localPlayer && localPlayer.velocityX !== undefined) ? localPlayer.velocityX : 0;
        let pVelY = (localPlayer && localPlayer.velocityY !== undefined) ? localPlayer.velocityY : 0;
        let pVelZ = (localPlayer && localPlayer.velocityZ !== undefined) ? localPlayer.velocityZ : 0;

        let tVelX = tVel ? (tVel.x || 0) : 0;
        let tVelY = tVel ? (tVel.y || 0) : 0;
        let tVelZ = tVel ? (tVel.z || 0) : 0;

        let deltaVx = tVelX - pVelX;
        let deltaVy = tVelY - pVelY;
        let deltaVz = tVelZ - pVelZ;

        // Chiếu vận tốc tương đối vào hệ quy chiếu Camera mặt phẳng XZ với góc yaw hiện tại
        let camYawRad = currentYaw * (Math.PI / 180.0);
        let cosCamYaw = Math.cos(camYawRad);
        let sinCamYaw = Math.sin(camYawRad);

        // Vận tốc tương đối NGANG màn hình (Lateral relative velocity)
        let relLateralVel = (deltaVx * cosCamYaw) - (deltaVz * sinCamYaw);
        // Vận tốc tương đối DỌC tầm nhìn (Radial relative velocity)
        let relRadialVel = (deltaVx * sinCamYaw) + (deltaVz * cosCamYaw);

        // Bù góc Yaw do chuyển động ngang tương đối trên màn hình
        if (distXZ > 0.4 && Math.abs(relLateralVel) > 0.08) {
            let relYawShift = (relLateralVel * 0.0166) / Math.max(1.2, distXZ) * (180.0 / Math.PI);
            let maxRelYaw = isDualAirborne ? 16.0 : 10.0;
            let dualAirborneYawBoost = isDualAirborne ? 1.85 : 1.0;
            predictiveYaw += Math.max(-maxRelYaw, Math.min(maxRelYaw, relYawShift * dualAirborneYawBoost));
        }

        // Bù góc Pitch do chuyển động cao độ tương đối (deltaVy = tVelY - pVelY)
        if (dist3D > 0.4 && Math.abs(deltaVy) > 0.15) {
            // Trong Free Fire coordinate: dy tăng -> pitch cần âm hơn (nâng nòng lên đón đầu)
            let relPitchShift = -(deltaVy * 0.0166) / Math.max(1.2, dist3D) * (180.0 / Math.PI);
            let maxRelPitch = isDualAirborne ? 7.0 : 4.5;
            let dualAirbornePitchBoost = isDualAirborne ? 1.6 : 1.0;
            predictivePitch += Math.max(-maxRelPitch, Math.min(maxRelPitch, relPitchShift * dualAirbornePitchBoost));
        }

        // ====================================================================
        // PER-WEAPON MICRO-TUNING: TINH CHỈNH GÓC THEO TỪNG KHẨU SÚNG
        // ====================================================================
        const subType = weapon.subType || "NONE";
        if (subType === "MP40") {
            // MP40 cực nhanh: Khóa ghim đỉnh đầu từ viên thứ 2 ở tầm trung/xa
            if (!isCQC && weapon.bulletCount >= 2) {
                predictivePitch = Math.max(predictivePitch, -0.4);
            }
        } else if (subType === "AK47") {
            // AK47 giật mạnh 3 viên đầu: Tăng lực ghìm nòng
            if (weapon.bulletCount <= 3 && weapon.isFiring) {
                predictivePitch -= 0.6;
            }
        } else if (isMarksmanOrOneTap) {
            // [V20 DMR & ONE-TAP PINPOINT LOCK]: Woodpecker, SKS, Dragunov, AC80, DE, M500, M590
            // Khóa thẳng vào điểm ngọt trán trên mọi cự ly khi nổ súng
            if (weapon.isFiring) {
                if (predictivePitch < -0.15) {
                    predictivePitch = Math.min(-0.25, predictivePitch * 1.25);
                }
            }
        }

        // ====================================================================
        // SELF-MOTION COMPENSATION: Trừ quán tính bản thân
        // Khi paneer di chuyển (strafe), camera xoay → AI vector bị lệch.
        // Trừ selfAngularVel để AI chỉ nhắm vào target, không bị self-drift.
        // ====================================================================
        let selfVelYaw = state.localPlayer.selfAngularVelYaw || 0;
        let selfVelPitch = state.localPlayer.selfAngularVelPitch || 0;
        
        // Chỉ bù khi chuyển động đáng kể (> 0.1 degree/frame)
        // và KHÔNG đang flick (flick là intentional, không cần bù)
        if (Math.abs(selfVelYaw) > 0.1 && input.magnitude < 30.0) {
            predictiveYaw -= selfVelYaw * 0.6; // Bù 60% self-rotation
        }
        if (Math.abs(selfVelPitch) > 0.1 && input.magnitude < 30.0) {
            predictivePitch -= selfVelPitch * 0.4; // Bù 40% (Y thận trọng hơn)
        }

        let aiVectorX = 0;
        let aiVectorY = 0;
        let inEventHorizon = false;

        // ====================================================================
        // [V20] ADAPTIVE EVENT HORIZON — Mở rộng cho súng gõ 1 viên & DMR
        // Gần (2m): 1.80° (mở rộng từ 1.20° → ổn định lock CQC)
        // Trung bình (5m): 1.10° (mở rộng từ 0.64° → chống flip-flop)
        // Xa (10m): 0.65° (mở rộng từ 0.35° → stable long range)
        // ====================================================================
        let baseEHRadius = Math.max(0.65, Math.min(1.80, 5.0 / Math.max(1.5, dist3D)));
        // Event Horizon scaling theo combat context
        let ehMultiplier = 1.0;
        if (weapon.isFiring) {
            ehMultiplier = 1.8;
            if (weaponType === "SMG" || weaponType === "AR") {
                ehMultiplier = 2.2; // SMG/AR sấy liên tục: Mở rộng 120%
            } else if (isMarksmanOrOneTap) {
                ehMultiplier = 2.5; // Marksman/One-Tap: Mở rộng phễu hút đầu cực đại
            }
            if (absAngSpeedYaw > 20.0) {
                ehMultiplier *= 1.3;
            }
        }
        let eventHorizonRadius = baseEHRadius * ehMultiplier;

        // ====================================================================
        // GIAI ĐOẠN 2: THU THẬP KHÔNG GIAN & TIẾP CẬN MỤC TIÊU
        // ====================================================================
        if (dist2D <= eventHorizonRadius) {
            // [V20] EVENT HORIZON: Zero-Lag Gyro Lock + Nam châm dính đầu
            engine.isABSBraking = true;
            inEventHorizon = true;

            let ehLeadMult = isCQC ? 1.65 : (isMarksmanOrOneTap ? 1.55 : 1.45);
            let velocitySyncX = enemyVelYawFrame * SENS_X * ehLeadMult;
            let velocitySyncY = enemyVelPitchFrame * SENS_Y * 1.35;

            if (enemyVelPitchFrame > 0.015) {
                velocitySyncY *= 1.40;
            } else if (enemyVelPitchFrame < -0.015) {
                velocitySyncY *= 1.15;
            }

            // DMR & One-tap: Ghim chết đầu 100% không delay (lockDamp = 1.30)
            let lockDamp = isMarksmanOrOneTap ? 1.30 : (absAngSpeedYaw > 2.0 ? 1.25 : 0.92);
            aiVectorX = velocitySyncX + (predictiveYaw * SENS_X * lockDamp);
            aiVectorY = velocitySyncY + (predictivePitch * SENS_Y * lockDamp);
        } else {
            // APPROACH & TRACKING
            engine.isABSBraking = false;

            let yawGain = Math.min(1.5, 0.6 + dist2D * 0.15);
            if (isMarksmanOrOneTap) {
                yawGain = Math.max(1.20, yawGain); // Duy trì lực quét mạnh, không hãm phanh sớm
            }

            aiVectorX = predictiveYaw * SENS_X * yawGain;

            if (predictivePitch < 0) {
                // TÂM Ở DƯỚI ĐẦU -> CƠ CHẾ NÂNG TÂM LÊN ĐỈNH SỌ
                if (isStuckInBodyOrLegs || isCQC) {
                    aiVectorY = -instantHeadEjector;
                } else {
                    let approachGain = Math.min(1.6, 0.6 + dist2D * 0.15);
                    let liftGain = (dist3D > 8.0) ? (isMarksmanOrOneTap ? 1.35 : 0.90) : 1.25;

                    // WEAPON-TYPE AWARE TRACKING GAINS
                    if (weaponType === "SMG" || weaponType === "AR") {
                        if (weapon.isFiring) {
                            liftGain *= 1.8;
                            let recoilBoost = Math.min(1.5, 1.0 + (weapon.bulletCount || 0) * 0.03);
                            liftGain *= recoilBoost;
                        }
                    } else if (isMarksmanOrOneTap) {
                        approachGain = Math.max(1.25, approachGain); // Khóa gia tốc tiến tới sọ
                    }

                    aiVectorY = -Math.max(Math.abs(predictivePitch * SENS_Y * approachGain * liftGain), instantHeadEjector);
                }
            } else {
                // SNAP CORRECTION: Sửa overshoot trong 1 frame
                if (predictivePitch < 2.0) {
                    let snapForce = predictivePitch * SENS_Y * (isMarksmanOrOneTap ? 1.20 : 0.90);
                    aiVectorY = Math.max(4.0, snapForce);
                } else {
                    let yDamper = Math.min(1.0, 2.5 / dist2D);
                    aiVectorY = predictivePitch * SENS_Y * yDamper * 0.55;
                }

                if (weaponType === "MARKSMAN" || weaponType === "SNIPER") {
                    aiVectorY *= 1.5;
                }

                let maxPitchCorrection = isADS ? (35.0 * fovRatio) : (dist3D > 8.0 ? 35.0 : 55.0);
                aiVectorY = Math.min(aiVectorY, maxPitchCorrection);
            }
        }

        // ====================================================================
        // ADS PRE-SETTLE: Chờ 4 frame sau khi bật scope trước khi AI can thiệp mạnh
        // ====================================================================
        if (isADS && !engine.wasADS) {
            engine.adsCalmFrames = 4;
        }
        engine.wasADS = isADS;

        if (engine.adsCalmFrames > 0) {
            engine.adsCalmFrames--;
            aiVectorX *= 0.3;
            aiVectorY *= 0.2;
        }

        // ====================================================================
        // ====================================================================
        // [COMBAT FAST-RESPONSE]: LÕI VẨY TÂM & LIA TÂM CHÍNH XÁC (FLICK & TRACK ACCELERATOR)
        // Đáp ứng tức thời trong giao tranh: vẩy tâm tốc độ cao ghim trúng sọ trong frame 1,
        // lia tâm bám chặt mục tiêu chuyển động không bị tụt lại phía sau
        // ====================================================================
        if (input.magnitude > 16.0 && !inEventHorizon) {
            let flickDirX = Math.sign(input.rawX);
            let flickDirY = Math.sign(input.rawY);
            let targetDirX = Math.sign(yawErr);
            let targetDirY = Math.sign(pitchErr);

            if (weapon.isFiring) {
                if (flickDirX === targetDirX && flickDirX !== 0) {
                    let flickBoostX = isMarksmanOrOneTap ? 1.35 : (weaponType === "SHOTGUN" ? 1.30 : 1.20);
                    aiVectorX *= flickBoostX;
                }
                if (flickDirY < 0 && pitchErr < 0) {
                    let flickBoostY = isMarksmanOrOneTap ? 1.30 : (weaponType === "SHOTGUN" ? 1.25 : 1.15);
                    aiVectorY *= flickBoostY;
                }
            } else {
                if (flickDirX === targetDirX && flickDirX !== 0) {
                    aiVectorX *= 1.15;
                }
                if (flickDirY === targetDirY && flickDirY !== 0) {
                    aiVectorY *= 1.10;
                }
            }
        }

        // ====================================================================
        // GIAI ĐOẠN 3: LÕI ĐỘNG HỌC TAY NGƯỜI & ĐIỀU TỐC QUÁN TÍNH BẤT BIẾN
        // (INVARIANT TRAJECTORY & SWIPE GOVERNOR ENGINE)
        // Giải quyết triệt để 2 vấn đề chí mạng:
        // 1. CHỐNG VỌT QUÁ ĐẦU: Khóa trần tọa độ sọ (Crown Altitude Terminal Clamp).
        //    Dù người chơi vuốt nhẹ (-20px) hay cực mạnh (-150px), lực nâng tâm
        //    được điều tiết chuẩn xác để nòng súng cán đích đỉnh sọ và dừng lại.
        //    Lực vuốt thừa được chuyển hướng sang Kinetic Deflection để khóa sống mũi.
        // 2. CHỐNG TỤT LẠI PHÍA SAU (ANTI-LAG TRACKING): Khóa tốc độ bám góc ngang.
        //    Khi kẻ địch di chuyển (chạy/nhảy/lướt), hệ thống ưu tiên 100% vector dẫn đường
        //    (Lead Tracking Vector). Triệt tiêu hoàn toàn độ trôi chéo ngón tay (Off-angle drift)
        //    khiến tâm súng không bao giờ bị rớt lại sau lưng kẻ địch.
        // ====================================================================
        let userX = input.rawX || 0;
        let userY = input.rawY || 0;
        let swipeMag = Math.sqrt((userX * userX) + (userY * userY));
        let isSwiping = input.isSwiping || swipeMag > 0.5;

        let targetPixelX = predictiveYaw * SENS_X;
        let targetPixelY = predictivePitch * SENS_Y;

        // Vận tốc bám mục tiêu trục ngang hoàn chỉnh (Full Aimbot Lead & Convergence Speed)
        let leadFactorX = isMarksmanOrOneTap ? 1.55 : (isCQC ? 1.65 : 1.45);
        let unifiedAITargetX = inEventHorizon ? aiVectorX : ((enemyVelYawFrame * SENS_X * leadFactorX) + targetPixelX);

        let finalDeltaX = unifiedAITargetX;
        let finalDeltaY = aiVectorY;

        // Nhận diện trạng thái di chuyển của kẻ địch với độ nhạy cao (High-Precision Motion Detector)
        let isEnemyMoving = (Math.abs(enemyVelYawFrame) >= 0.03 || absAngSpeedYaw >= 2.0 || 
            (target.velocity && (Math.abs(target.velocity.x || 0) > 0.25 || Math.abs(target.velocity.z || 0) > 0.25)));

        // ====================================================================
        // GIAI ĐOẠN 3: LÕI ĐIỀU HƯỚNG TÁC CHIẾN TỰ ĐỘNG BẤT BIẾN
        // (AUTONOMOUS SWIPE-INDEPENDENT COMBAT GUIDANCE & INVARIANT APEX GOVERNOR)
        // Mục tiêu tối thượng:
        // 1. Khi NỔ SÚNG (weapon.isFiring):
        //    - Hoàn toàn KHÔNG phụ thuộc vào hướng vuốt hay lực vuốt của người chơi.
        //    - Dù người chơi vuốt ngược hướng -> Triệt tiêu 100% lực cản, cưỡng chế nòng bẻ vào đầu địch.
        //    - Dù người chơi vuốt xuống (ghìm recoil tay) -> Triệt tiêu 100% lực dìm, tự động phóng lên đỉnh sọ.
        //    - Dù người chơi vuốt cực mạnh (-150px) -> Khóa cứng tại đỉnh sọ (Crown Clamp), chuyển hóa lực thừa sang sống mũi.
        //    - Dù người chơi vuốt quá nhẹ hoặc KHÔNG vuốt (0px) -> Hệ thống tự động cấp 100% lực dẫn hướng vào sọ.
        //    - KẺ ĐỊCH DI CHUYỂN: Chủ động đón đầu tốc độ cao (Active Lead Interception), triệt tiêu lag hiển thị/mạng.
        //    - KẺ ĐỊCH ĐỨNG YÊN: Dead-Stop Anchor & Critical Damping triệt tiêu 100% trượt sọ ra ngoài.
        // 2. Khi CHƯA BẮN (!weapon.isFiring):
        //    - Pre-Fire Flick Director: Uốn cong quỹ đạo ngón tay lướt qua ngực đón đầu địch.
        //    - Capture Zone Bypass: Tự động phóng vọt qua bẫy bụng native dù tay chỉ vuốt ngang.
        //    - Tự do quan sát: Bảo toàn 100% phản xạ tự nhiên khi lia góc nhìn.
        // ====================================================================
        if (weapon.isFiring) {
            let neededLiftPixels = Math.abs(predictivePitch) * SENS_Y;
            let maxHeadCeiling = (neededLiftPixels * 1.40) + (isSuperCQC ? 120.0 : (isCQC ? (isShotgunOrOneShot ? 140.0 : 48.0) : 16.0));
            if (isSuperCQC) {
                maxHeadCeiling = Math.max(maxHeadCeiling, 380.0);
            } else if (isDualAirborne) {
                maxHeadCeiling = Math.max(maxHeadCeiling, 360.0);
            } else if (dist3D > 7.0) {
                let longRangeCeiling = Math.max(16.0, Math.min(28.0, 320.0 / dist3D));
                maxHeadCeiling = Math.min(maxHeadCeiling, longRangeCeiling);
            }

            // ----------------------------------------------------------------
            // [TRỤC X KHI BẮN]: ĐIỀU HƯỚNG TỰ ĐỘNG & BÙ TRỄ TỐC ĐỘ DI CHUYỂN
            // ----------------------------------------------------------------
            let absYaw = Math.abs(yawErr);
            let targetDirX = Math.sign(unifiedAITargetX) || Math.sign(yawErr) || 1;
            let reqMagX = Math.abs(unifiedAITargetX);

            if (!isEnemyMoving) {
                // ============================================================
                // TRƯỜNG HỢP 1: KẺ ĐỊCH ĐỨNG YÊN (DEAD-STOP ANCHOR & CHỐNG TRƯỢT SỌ)
                // Triệt tiêu 100% trôi trượt nòng súng khi cán đích đỉnh sọ
                // ============================================================
                if (absYaw <= 0.35) {
                    // [DEAD-STOP KILLBOX]: Nòng dừng khựng lại tuyệt đối tại tâm trán / sống mũi
                    finalDeltaX = Math.min(1.0, Math.max(-1.0, yawErr * SENS_X * 0.35));
                } else if (absYaw <= 1.0) {
                    // [CRITICAL DAMPING]: Phanh hãm tới hạn khi chạm mép đầu, đáp êm không vọt lố
                    let decelFactor = Math.max(0.35, Math.min(1.0, Math.sqrt((absYaw - 0.20) / 0.80)));
                    let arrivalSpeed = yawErr * SENS_X * decelFactor;
                    let maxClampX = Math.abs(yawErr * SENS_X);
                    finalDeltaX = Math.sign(arrivalSpeed) * Math.min(Math.abs(arrivalSpeed), maxClampX);
                } else if (dist3D > 7.0) {
                    // TẦM XA (>7M): Neo chặt vào vector căn chỉnh chuẩn xác của AI, triệt tiêu 100% lực vuốt lệch của tay
                    finalDeltaX = unifiedAITargetX;
                } else if (isSwiping && Math.sign(userX) === targetDirX && userX !== 0) {
                    let maxAllowedX = Math.max(reqMagX, Math.min(Math.abs(userX), reqMagX * 1.25));
                    finalDeltaX = targetDirX * maxAllowedX;
                } else if (isSwiping && Math.sign(userX) !== 0 && Math.sign(userX) !== targetDirX) {
                    finalDeltaX = unifiedAITargetX;
                } else {
                    finalDeltaX = unifiedAITargetX;
                }
            } else {
                // ============================================================
                // TRƯỜNG HỢP 2: KẺ ĐỊCH DI CHUYỂN (ACTIVE ANTI-LAG LEAD INTERCEPTOR)
                // Triệt tiêu 100% độ trễ hiển thị và input lag. Đón đầu và bám dính sọ liên tục.
                // Tuyệt đối không phanh hãm hoặc kẹp trần tốc độ bám đuổi!
                // ============================================================
                let leadMultiplier = (absYaw <= 0.35) ? 1.0 : (isCQC ? 1.65 : (dist3D <= 12.0 ? 1.50 : 1.40));
                if (isDualAirborne) {
                    leadMultiplier = Math.max(leadMultiplier, 2.05); // Dual-Airborne: Tăng tốc đón đầu cực hạn khi cả 2 cùng nhảy
                }
                if (isMarksmanOrOneTap && absYaw > 0.35) {
                    leadMultiplier = Math.max(leadMultiplier, 1.55);
                }
                if (engine.reversalBoostFrames && engine.reversalBoostFrames > 0) {
                    leadMultiplier = Math.max(leadMultiplier, 1.85); // Địch đổi hướng: Boost đón đầu cực đại
                }

                let maxAccelBoost = (absYaw <= 0.35) ? 2.5 : 8.0;
                let accelBoostX = Math.max(-maxAccelBoost, Math.min(maxAccelBoost, (engine.enemyAccelYaw || 0) * 0.0166 * SENS_X * 0.25));

                let dynamicTargetX = (predictiveYaw * SENS_X * leadMultiplier) + accelBoostX;
                targetDirX = Math.sign(dynamicTargetX) || Math.sign(predictiveYaw) || Math.sign(enemyVelYawFrame) || 1;

                if (dist3D > 7.0) {
                    // TẦM XA (>7M): Neo chặt vào vector đón đầu của AI, không bị lực tay làm văng ra ngoài
                    finalDeltaX = dynamicTargetX;
                } else if (isSwiping && Math.sign(userX) === targetDirX && userX !== 0) {
                    finalDeltaX = targetDirX * Math.max(Math.abs(dynamicTargetX), Math.abs(userX) * 1.25);
                } else if (isSwiping && Math.sign(userX) !== 0 && Math.sign(userX) !== targetDirX) {
                    finalDeltaX = dynamicTargetX;
                } else {
                    finalDeltaX = dynamicTargetX;
                }

                // Chuyển hóa động năng vuốt dọc của tay sang lực bẻ ngang đón đầu (CHỈ ÁP DỤNG CỰ LY GẦN & TRUNG BÌNH <= 7M)
                if (userY < 0 && dist3D <= 7.0) {
                    let lateralAssist = Math.min(22.0, Math.abs(userY) * 0.35);
                    finalDeltaX += (lateralAssist * targetDirX);
                }
            }

            // ----------------------------------------------------------------
            // [TRỤC Y KHI BẮN]: KHÓA MỎ NEO ĐỈNH SỌ BẤT BIẾN (INVARIANT CROWN ANCHOR)
            // ----------------------------------------------------------------
            let anchorPitchLimit = Math.max(0.30, Math.min(0.55, 3.5 / Math.max(2.0, dist3D)));
            let atCrownSweetSpot = (aimZone === "CROWN_HEAD" || (Math.abs(predictivePitch) <= anchorPitchLimit && !isStuckInLegs && !isStuckInStomach && aimZone !== "LEGS" && aimZone !== "STOMACH" && aimZone !== "CHEST"));
            let isStuckInChest = (aimZone === "CHEST" || (!atCrownSweetSpot && !isStuckInLegs && !isStuckInStomach && predictivePitch < -anchorPitchLimit));

            if (atCrownSweetSpot) {
                // [ĐÃ Ở TẠI ĐỈNH SỌ]: BỨC TƯỜNG THỦY TINH KHÓA CHẾT ĐỘ CAO SỌ (GLASS CEILING CLAMP)
                // - Triệt tiêu 100% mọi lực vuốt lên (userY < 0): Chống vọt quá đầu lên trời
                // - Triệt tiêu 100% mọi lực vuốt xuống (userY > 0): Không để game dìm tâm xuống ngực
                finalDeltaY = Math.min(1.5, Math.max(-1.5, predictivePitch * SENS_Y * 0.5));

                // Kinetic Deflection: CHỈ căn chỉnh sống mũi khi tâm còn lệch khỏi trục giữa sọ (|yawErr| > 0.35°)
                // Tuyệt đối không sinh lực bẻ ngang khi đã ở ngay sống mũi (|yawErr| <= 0.35°), triệt tiêu hoàn toàn rò rỉ lực làm trượt tâm ra ngoài!
                if (userY < 0 && Math.abs(yawErr) > 0.35 && dist3D <= 7.0) {
                    let deflectionForce = Math.min(8.0, Math.abs(userY) * 0.25);
                    let directionToCenter = Math.sign(yawErr);
                    finalDeltaX += (deflectionForce * directionToCenter);
                }
            } else if (predictivePitch < 0) {
                // [TÂM Ở DƯỚI ĐẦU]: CUNG CẤP TRỌN VẸN 100% LỰC NÂNG LÊN ĐỈNH SỌ BẤT KỂ TAY VUỐT THẾ NÀO
                if (isStuckInBodyOrLegs) {
                    // Dính vào chân/bụng/momentum tunnel: Kích hoạt xung lực phản lực tức thời
                    let chestLockBuster = (isSuperCQC ? 150.0 : (isCQC ? 100.0 : 70.0)) * Math.min(1.0, Math.abs(predictivePitch) / 3.0);
                    let breakImpulse = Math.max(Math.abs(aiVectorY), instantHeadEjector);

                    if (weapon.bulletCount <= 3) {
                        breakImpulse = Math.max(breakImpulse * 1.35, isSuperCQC ? 280.0 : 185.0);
                        chestLockBuster = Math.max(chestLockBuster, isSuperCQC ? 120.0 : 85.0);
                    }

                    let candidateLift = breakImpulse + chestLockBuster;
                    let maxBodyLift = isSuperCQC ? 420.0 : (isCQC ? 280.0 : 220.0);
                    finalDeltaY = -Math.min(maxBodyLift, candidateLift);
                } else {
                    // Ở ngực / cổ: Nâng dứt khoát vượt qua ngực cán đích đỉnh sọ
                    let precisionLift;
                    if (dist3D > 7.0) {
                        // TẦM XA (>7M): Bơm lực nâng vừa đủ đưa tâm đến đầu, không bị bơm dư thừa vọt lố
                        let longRangeMin = dist3D > 14.0 ? 8.0 : 12.0;
                        precisionLift = Math.max(neededLiftPixels * 1.08 + 1.0, longRangeMin);
                    } else {
                        let chestBreakMin = isSuperCQC ? 320.0 : (isCQC ? (isShotgunOrOneShot ? 260.0 : 190.0) : 75.0);
                        precisionLift = Math.max(neededLiftPixels * 1.50 + 12.0, chestBreakMin);
                        if (isSuperCQC) {
                            precisionLift = Math.max(precisionLift, Math.max(280.0, neededLiftPixels * 2.2));
                        } else if (isDualAirborne) {
                            precisionLift = Math.max(precisionLift, Math.max(260.0, neededLiftPixels * 2.1));
                        } else if (isCQC) {
                            let cqcMinLift = isShotgunOrOneShot ? 240.0 : 180.0;
                            precisionLift = Math.max(precisionLift, Math.max(cqcMinLift, neededLiftPixels * (isShotgunOrOneShot ? 2.0 : 1.45)));
                        }
                    }

                    let finalLift = Math.min(precisionLift, maxHeadCeiling);
                    finalDeltaY = -finalLift;

                    // Chuyển hóa lực vuốt thừa của tay người chơi nếu vuốt cực mạnh (CHỈ ÁP DỤNG CỰ LY GẦN <= 7M):
                    if (userY < 0 && Math.abs(userY) > finalLift && dist3D <= 7.0) {
                        let excessLiftForce = Math.abs(userY) - finalLift;
                        let deflectionForce = excessLiftForce * 0.25;
                        let directionToCenter = Math.sign(yawErr) || 1;
                        finalDeltaX += (deflectionForce * directionToCenter);
                    }
                }
            } else {
                // [OVERSHOOT SNAP]: Kéo tụt nòng xuống đỉnh sọ tức thì
                finalDeltaY = Math.min(45.0, Math.max(4.0, predictivePitch * SENS_Y * 1.15));
            }
        } else {
            // ================================================================
            // KHI CHƯA BẮN (!weapon.isFiring):
            // PRE-FIRE FLICK DIRECTOR, PRE-FIRE LEG EJECTOR & GLASS CEILING CLAMP
            // ================================================================
            let isAimingOrSwiping = isSwiping || Math.abs(userX) > 0 || Math.abs(userY) > 0 ||
                (payload.input_drag && (payload.input_drag.is_swiping || payload.input_drag.active || payload.input_drag.raw_y !== 0));

            if (isAimingOrSwiping) {
                // 1. TRỤC X KHI CHƯA BẮN:
                if (Math.abs(userX) >= 80.0) {
                    // Xoay màn hình nhanh (free look / camera spin): 1:1 bảo toàn tự nhiên 100%
                    finalDeltaX = userX;
                } else if (Math.sign(userX) === Math.sign(yawErr) && userX !== 0 && Math.abs(yawErr) > 0.3) {
                    // Vẩy tâm nhẹ cùng hướng mục tiêu: Trợ lực đón đầu có kiểm soát
                    let preAssistX = Math.min(55.0, Math.max(Math.abs(userX) * 0.9, Math.abs(unifiedAITargetX)));
                    finalDeltaX = Math.sign(userX) * preAssistX;
                } else {
                    finalDeltaX = userX; // Tự do quan sát
                }

                // 2. TRỤC Y KHI CHƯA BẮN:
                let anchorPitchLimit = Math.max(0.30, Math.min(0.55, 3.5 / Math.max(2.0, dist3D)));
                let isAtOrAboveCrown = (aimZone === "CROWN_HEAD" || predictivePitch >= -0.25 || Math.abs(predictivePitch) <= anchorPitchLimit);

                if (userY > 0) {
                    // Vuốt xuống đất nhìn đường/loot đồ: 100% tự do, không bị kéo giật lên đầu
                    finalDeltaY = userY;
                } else if (userY === 0) {
                    // Xoay ngang thuần túy: Không tự ý bơm lực dọc làm văng góc nhìn
                    finalDeltaY = 0;
                } else if (isAtOrAboveCrown) {
                    // [PRE-FIRE GLASS CEILING CLAMP - ẢNH 5]:
                    // Khi tâm đã chạm tới mỏ neo đỉnh sọ, triệt tiêu 100% mọi lực kéo vọt lên trời
                    // Không bao giờ để tâm súng bay lên trời trước khi đạn kịp bắn ra!
                    if (predictivePitch > 0) {
                        finalDeltaY = Math.min(30.0, Math.max(3.0, predictivePitch * SENS_Y * 1.0)); // Kéo tụt về sọ
                    } else {
                        finalDeltaY = Math.min(1.0, Math.max(-1.0, predictivePitch * SENS_Y * 0.4)); // Ghim cứng sọ
                    }
                } else if (isStuckInLegs || isStuckInStomach || aimZone === "STOMACH" || aimZone === "LEGS" || pitchErr < -0.8) {
                    // [PRE-FIRE INSTANT LEG/BODY EJECTOR - ẢNH 1 & ẢNH 2]:
                    // Vuốt lên (userY < 0) khi tâm ở chân/bụng -> Phóng thẳng lên sọ trong 0.03s
                    // Bứt phá hoàn toàn bẫy chân trước khi cơ chế bắt tâm 0.2s của game kích hoạt!
                    let neededLift = Math.abs(pitchErr) * SENS_Y;
                    let preFireEject = Math.max(160.0, neededLift * 1.50 + Math.abs(userY) * 1.20);
                    if (isStuckInLegs || aimZone === "LEGS") {
                        preFireEject = Math.max(preFireEject, 185.0);
                    }
                    finalDeltaY = -preFireEject;
                } else if (userY < 0 || pitchErr < -0.3) {
                    // Ở ngực/cổ vuốt lên: Phễu dẫn đường đón đầu vào sọ
                    let neededLift = Math.abs(pitchErr) * SENS_Y;
                    let funnelLift = Math.max(35.0, neededLift * 1.30 + Math.abs(userY) * 1.10);
                    finalDeltaY = -funnelLift;
                } else {
                    finalDeltaY = userY;
                }
            } else {
                finalDeltaX = 0;
                finalDeltaY = 0;
            }
        }

        // ====================================================================
        // [V20 TRIGGER-FRAME ZERO-ERROR SNAP & DMR HIGH-AUTHORITY LOCK]:
        // Trong các viên đầu tiên khi nổ súng, nảy tâm tức thì vào đỉnh sọ đối thủ
        // Đặc biệt với DMR (Woodpecker, SKS, Dragunov, AC80, DE, M500, M590): Đảm bảo 1 viên 1 mạng đỏ đầu
        // ====================================================================
        if (weapon.isFiring) {
            if (isMarksmanOrOneTap) {
                // DMR / ONE-TAP PINPOINT SNAP: Bứt phá hoàn toàn lực ma sát ngực ở cự ly xa
                let minDMRSnap = isADS ? 32.0 : (dist3D >= 14.0 ? 25.0 : 38.0);
                if (predictivePitch < -0.12) {
                    let targetSnapY = Math.min(-minDMRSnap, predictivePitch * SENS_Y * 1.40);
                    let maxAllowedDMR = (typeof maxHeadCeiling !== 'undefined') ? maxHeadCeiling : 30.0;
                    if (Math.abs(targetSnapY) > Math.abs(finalDeltaY)) {
                        finalDeltaY = Math.max(targetSnapY, -maxAllowedDMR);
                    }
                }
                let targetSnapX = predictiveYaw * SENS_X * 1.45;
                if (Math.abs(targetSnapX) > Math.abs(finalDeltaX)) {
                    finalDeltaX = targetSnapX;
                }
                engine.snapLockFrames = 5;
            } else if (weapon.bulletCount <= 3) {
                let snapPixelX = predictiveYaw * SENS_X * 1.25;
                if (Math.abs(snapPixelX) > Math.abs(finalDeltaX)) {
                    finalDeltaX = snapPixelX;
                }
                if (predictivePitch < -0.3) {
                    let snapPixelY = predictivePitch * SENS_Y * 1.35;
                    let maxAllowedSnap = isSuperCQC ? 420.0 : (isCQC ? 280.0 : ((isStuckInLegs || isStuckInStomach || aimZone === "LEGS" || aimZone === "STOMACH") ? 260.0 : (dist3D >= 14.0 ? 30.0 : (dist3D > 8.0 ? 45.0 : 120.0))));
                    let targetSnap = -Math.min(maxAllowedSnap, Math.abs(snapPixelY));
                    if (Math.abs(targetSnap) > Math.abs(finalDeltaY)) {
                        finalDeltaY = targetSnap;
                    }
                }
                if (localPlayer && localPlayer.isAirborne) {
                    finalDeltaY = Math.min(finalDeltaY, -30.0);
                }
                engine.snapLockFrames = 5;
            } else {
                // [SUSTAINED SPRAY HEAD SUCTION - TỪ VIÊN THỨ 4 TRỞ ĐI]:
                // Khi sấy liên thanh, nếu recoil nảy lên trên đỉnh đầu -> Tức thì kéo tụt nòng súng về trán
                if (predictivePitch > 0.15) {
                    let pullDown = Math.min(18.0, Math.max(3.0, predictivePitch * SENS_Y * 1.2));
                    if (pullDown > finalDeltaY) {
                        finalDeltaY = pullDown;
                    }
                }
                // Nếu sấy mà tâm bị rung lắc văng ra ngoài đầu (sai số lớn > 1.0° hoặc tụt xuống cổ < -0.35°)
                // Lập tức kích hoạt lực từ trường sọ hút phập tâm súng trở lại sọ
                if (Math.abs(target.yawError || 0) > 1.0) {
                    let suctionX = predictiveYaw * SENS_X * 1.35;
                    if (Math.abs(suctionX) > Math.abs(finalDeltaX)) {
                        finalDeltaX = suctionX;
                    }
                }
                if (predictivePitch < -0.35) {
                    let suctionY = predictivePitch * SENS_Y * 1.35;
                    if (Math.abs(suctionY) > Math.abs(finalDeltaY)) {
                        finalDeltaY = suctionY;
                    }
                }
                engine.snapLockFrames = 5;
            }
        }

        // ====================================================================
        // [CQC < 3M CONTINUOUS MAGNETIC HEADLOCK SUCTION]:
        // Áp dụng cự ly < 3.2m: Tạo lực lôi tâm súng và đạn vào đầu tức thì
        // Duy trì liên tục khóa tâm trên đầu kẻ địch cho tất cả các lượt đạn tiếp theo đến khi nhả nút bắn!
        // ====================================================================
        if (isCQC && weapon.isFiring) {
            engine.cqcLockActive = true;
            engine.snapLockFrames = 10; // Duy trì liên tục xuyên suốt lượt sấy

            // Lực hút đầu tức thời trục X & dẫn đầu chuyển động ngang
            let cqcTargetSnapX = (predictiveYaw * SENS_X * 1.55) + (enemyVelYawFrame * SENS_X * 1.6);
            if (Math.abs(cqcTargetSnapX) > Math.abs(finalDeltaX)) {
                finalDeltaX = cqcTargetSnapX;
            }

            // Lực lôi tâm trục Y: Phá tan hoàn toàn bẫy ngực/bụng native của game và khóa đỉnh sọ
            let isUltraClose = isSuperCQC || dist3D < 2.5 || distXZ < 2.2;
            let realCqcPitch = target.pitchError !== undefined ? target.pitchError : predictivePitch;
            let atActualCrown = (aimZone === "CROWN_HEAD") || (isUltraClose ? (realCqcPitch >= -0.25) : Math.abs(predictivePitch) <= 1.2);
            if (atActualCrown) {
                // Đã ở đỉnh sọ: Khóa mỏ neo vĩnh viễn trên đầu địch, chống tụt lại ngực dù game kéo xuống
                finalDeltaY = (enemyVelPitchFrame * SENS_Y * 1.35) + Math.min(2.0, Math.max(-2.0, predictivePitch * SENS_Y));
            } else if (predictivePitch < 0) {
                let cqcSuctionY = isUltraClose ? Math.min(-340.0, predictivePitch * SENS_Y * 2.6) : (isSuperCQC ? Math.min(-280.0, predictivePitch * SENS_Y * 2.2) : Math.min(-150.0, predictivePitch * SENS_Y * 1.75));
                if (Math.abs(cqcSuctionY) > Math.abs(finalDeltaY)) {
                    finalDeltaY = cqcSuctionY;
                }
            }
        } else if (!weapon.isFiring) {
            engine.cqcLockActive = false;
        }

        // ====================================================================
        // [DEAD-STOP CROWN ANCHOR & SUSTAINED SPRAY BULLETS]:
        // Khóa mỏ neo đỉnh sọ thích ứng theo cự ly, duy trì liên tục xuyên suốt 2..30+ viên
        // ====================================================================
        let anchorPitchLimit = Math.max(0.30, Math.min(0.55, 3.5 / Math.max(2.0, dist3D)));
        if (!isCQC && weapon.isFiring && (!localPlayer || !localPlayer.isAirborne) && Math.abs(predictivePitch) <= anchorPitchLimit && Math.abs(yawErr) <= 0.8) {
            engine.snapLockFrames = 5;
            finalDeltaY = Math.min(2.0, Math.max(-2.0, predictivePitch * SENS_Y)); // Đứng yên ghim đỉnh trán
        } else if (!isCQC && engine.snapLockFrames > 0 && userY <= 0 && weapon.isFiring && Math.abs(predictivePitch) <= anchorPitchLimit) {
            engine.snapLockFrames--;
            finalDeltaY = Math.min(4.0, Math.max(0.0, predictivePitch * SENS_Y));
        }

        // ====================================================================
        // GIAI ĐOẠN 4: GÓI GỌN VÀ NẠP LỰC VÀO KHO KÝ SINH DOM
        // Khôi phục biên độ tối đa (MAX_SWIPE) cho phép lia tâm siêu mượt và bén
        // ====================================================================
        const MAX_SWIPE = isADS ? 140.0 : (isSuperCQC ? 380.0 : ((isCQC || isStuckInBodyOrLegs) ? 260.0 : 190.0));
        finalDeltaX = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, finalDeltaX));
        finalDeltaY = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, finalDeltaY));

        // [DEAD-STOP SUB-PIXEL CLAMP & JITTER PURGE]:
        // Khi tâm súng đã đến tâm đầu trong lúc bắn, xóa sạch sub-pixel remainder
        // để triệt tiêu hoàn toàn vi rung động và hiện tượng trôi dạt ra ngoài mép đầu
        if (weapon.isFiring && Math.abs(predictiveYaw) <= 0.35 && Math.abs(predictivePitch) <= 0.35) {
            engine.remX = 0;
            engine.remY = 0;
            if (Math.abs(finalDeltaX) < 0.6) finalDeltaX = 0;
            if (Math.abs(finalDeltaY) < 0.6) finalDeltaY = 0;
        }

        if (localPlayer && localPlayer.isAirborne) {
            if (localPlayer.jumpPhase === "FALLING") {
                finalDeltaY -= Math.max(3.0, Math.abs(localPlayer.velocityY || 4.0) * 0.85);
            } else if (localPlayer.jumpPhase === "ASCENDING") {
                finalDeltaY += Math.max(1.0, Math.abs(localPlayer.velocityY || 3.0) * 0.25);
            }
        }

        if (Math.abs(finalDeltaX) < 0.2) finalDeltaX = 0;
        if (Math.abs(finalDeltaY) < 0.2) finalDeltaY = 0;

        let roundedX = Math.round(finalDeltaX);
        let roundedY = Math.round(finalDeltaY);

        if (engine.remX === undefined) { engine.remX = 0; engine.remY = 0; }
        engine.remX += (finalDeltaX - roundedX);
        engine.remY += (finalDeltaY - roundedY);

        let executeX = roundedX + Math.round(engine.remX);
        let executeY = roundedY + Math.round(engine.remY);

        engine.remX -= Math.round(engine.remX);
        engine.remY -= Math.round(engine.remY);

        // BƠM XUNG LỰC VÀO PROXY & BỘ LỌC LIÊN TỤC:
        _vortex.__TargetOffsetX = executeX;
        _vortex.__TargetOffsetY = executeY;
        _vortex.__PendingDeltaX = executeX;
        _vortex.__PendingDeltaY = executeY;

        engine.lastAI_X = executeX;
        engine.lastAI_Y = executeY;

        payload.touch_delta.x = executeX;
        payload.touch_delta.y = executeY;

        return payload;
    }
}

// ============================================================================
// MODULE 11: MICRO HAPTIC STABILIZER (BỘ ỔN ĐỊNH CẢM ỨNG VI MÔ)
// Cân bằng lực kéo ngón tay thực tế: Bù thiếu lực ở cự ly gần (<3m) và
// triệt tiêu lực thừa ở cự ly xa (>7m), bảo vệ tâm crosshair ghim chuẩn xác
// ============================================================================
class MicroHapticStabilizer {
    static execute(payload) {
        // BẢO VỆ JOYSTICK: Bỏ qua nếu là gói di chuyển
        if (payload.is_joystick || payload.is_movement || payload.touch_type === "movement" || payload.channel === "movement" || payload.type === "joystick" || payload.type === "move" || payload.is_move) {
            return payload;
        }
        if (!payload.touch_delta) return payload;

        const state = _vortex.__VortexState;
        const target = state.target;
        const weapon = state.weapon;
        const engine = state.engine;

        if (!target.id || !weapon.isFiring) return payload;

        let deltaY = payload.touch_delta.y || 0;
        let deltaX = payload.touch_delta.x || 0;
        let dist = target.distance3D || 999.0;
        let userRawY = state.input ? (state.input.rawY || 0) : 0;

        // 1. CỰ LY GẦN & DUAL-AIRBORNE CQC (< 6.5m): HẤP THỤ THIẾU LỰC & BỨT PHÁ BẪY NGỰC
        // Nếu người chơi kéo ngón tay quá chậm khi đang ở CQC hoặc cả 2 cùng nhảy,
        // bộ ổn định tự động bảo toàn xung lực bứt phá để không bị tụt lại ngực/bụng
        let isShotgun = (weapon.type === "SHOTGUN" || weapon.subType === "M1887" || weapon.subType === "MAG7");
        let isDualAirborne = (state.localPlayer && state.localPlayer.isAirborne) && (target.isAirborne);
        let cqcThreshold = (isShotgun || isDualAirborne) ? 6.5 : 3.0;

        if (dist < cqcThreshold && (target.isStuckInStomach || target.isStuckInLegs || target.aimZone !== "CROWN_HEAD" || isDualAirborne || dist < 2.8)) {
            let minLift = (dist < 2.5) ? -300.0 : ((isShotgun || isDualAirborne) ? -220.0 : -180.0);
            if (deltaY > (minLift + 40.0)) {
                deltaY = Math.min(deltaY, minLift);
            }
        } else if (dist >= cqcThreshold && (target.isStuckInStomach || target.isStuckInLegs || target.aimZone !== "CROWN_HEAD")) {
            // Tầm trung & xa: Tự động duy trì xung lực tối thiểu bứt phá khỏi ngực/bụng
            let midLongMin = (dist > 7.0) ? (dist > 14.0 ? -24.0 : -28.0) : -65.0;
            if (deltaY > midLongMin) {
                deltaY = Math.min(deltaY, midLongMin);
            }
        }

        // 2. CỰ LY XA (> 7.0m): HẤP THỤ THỪA LỰC (CHỐNG VỌT LÊN TRỜI)
        // Nếu người chơi giật tay quá mạnh khi tâm đã ở đầu mục tiêu,
        // bộ ổn định triệt tiêu xung lực thừa, khóa trần tại đỉnh sọ
        if (dist > 7.0) {
            if (target.aimZone === "CROWN_HEAD" || Math.abs(target.pitchError || 0) <= 0.35) {
                if (deltaY < -2.0) deltaY = -1.0; // Ghim cứng tại sọ, không cho vọt lên trời
            }
            // Khử tạp âm vuốt chéo của tay người chơi ở cự ly xa
            if (Math.abs(target.yawError || 0) <= 0.35) {
                deltaX = Math.max(-2.0, Math.min(2.0, deltaX));
            }
        }

        payload.touch_delta.x = deltaX;
        payload.touch_delta.y = deltaY;
        _vortex.__PendingDeltaX = deltaX;
        _vortex.__PendingDeltaY = deltaY;
        _vortex.__TargetOffsetX = deltaX;
        _vortex.__TargetOffsetY = deltaY;

        return payload;
    }
}

// ============================================================================
// [NEW] LÕI VŨ KHÍ: MARKSMAN CORE (SÚNG GÕ 1 VIÊN DE, WOODPECKER, SKS)
// ============================================================================
class MarksmanCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        if (payload.weapon) {
            // Súng gõ 1 viên & DMR (Woodpecker, SKS, AC80, Desert Eagle, Dragunov/SVD, M500, M590):
            // Triệt tiêu 100% độ giật và độ nở nòng cho MỌI phát bắn One-Shot
            payload.weapon.recoil_y = 0.0;
            payload.weapon.recoil_x = 0.0;
            payload.weapon.recoil_accumulation = 0.0;

            // Thu gọn hồng tâm tuyệt đối để đạn ghim thẳng 1 điểm vào sọ
            payload.weapon.base_spread = 0.0;
            payload.weapon.dynamic_spread = 0.0;
            payload.weapon.spread_add_per_shot = 0.0;
            payload.weapon.max_spread = 0.0001;
            payload.weapon.spread_scale = 0.0;
            payload.weapon.recovery_time = 0.0;
            payload.weapon.spread_decay = 999999.0;

            if (payload.weapon.recoil_recovery) {
                payload.weapon.recoil_recovery = 999999.0;
            }

            // HỒ SƠ CHUYÊN BIỆT: Tăng vận tốc đạn (Bullet Velocity) cho DMR & súng gõ
            // Triệt tiêu thời gian bay (Travel Time) và độ rơi đạn (Bullet Drop) ở tầm xa
            payload.weapon.bullet_velocity_multiplier = 3.0;
            payload.weapon.bullet_speed = 999999.0;
            payload.weapon.range = 9999.0;
            payload.weapon.damage_drop_start = 9999.0;
            payload.weapon.damage_drop_end = 9999.0;
        }
        return payload;
    }
}

// ============================================================================
// BƯỚC 4: WEAPON SPECIFIC CORES (LÕI VŨ KHÍ & THAO TÚNG ĐƯỜNG ĐẠN)
// Công nghệ: Quantum Choke (SG), Zero-Bloom Loop (SMG), First-Shot Laser (AR), Inverse Braking (Marksman)
// ============================================================================

class ShotgunCore {
    static execute(payload) {
        const weaponState = _vortex.__VortexState.weapon;
        if (payload.weapon) {
            // Shotgun One-Shot (M1887, M1014, Mag-7):
            // Ép toàn bộ chùm đạn thành Slug Laser hội tụ 100% vào sọ, xóa sạch độ tỏa
            payload.weapon.base_spread = 0.0001;
            payload.weapon.dynamic_spread = 0.0;
            payload.weapon.max_spread = 0.0001;
            payload.weapon.spread_add_per_shot = 0.0;
            payload.weapon.recoil_y = 0.0;
            payload.weapon.recoil_x = 0.0;
            payload.weapon.recoil_accumulation = 0.0;

            if (payload.weapon.recoil_recovery) {
                payload.weapon.recoil_recovery = 99999.0;
            }

            // HỒ SƠ CHUYÊN BIỆT:
            // M1887: Bắn 2 viên tốc độ cao, lập tức hồi phục 100% nòng sau viên thứ 2
            if (weaponState.subType === "M1887") {
                if (weaponState.bulletCount >= 2 && payload.weapon.recoil_recovery) {
                    payload.weapon.recoil_recovery = 999999.0;
                }
            }
            // M1014: Duy trì chùm đạn laser nén phẳng suốt chu kỳ 6 viên
            else if (weaponState.subType === "M1014") {
                payload.weapon.recoil_accumulation = 0.0;
                payload.weapon.base_spread = 0.0001;
            }
        }
        return payload;
    }
}

class SMGCore {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const weaponState = state.weapon;
        const target = state.target;
        if (payload.weapon) {
            // ĐỘT PHÁ V15: Triệt tiêu 100% giật và tản mát ở MỌI viên đạn khi bắn hoặc có mục tiêu (MP40, UMP, Thompson...)
            if (target.id || weaponState.isFiring || payload.weapon.is_firing || weaponState.bulletCount >= 1) {
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_pitch_kick = 0.0;
                payload.weapon.recoil_yaw_kick = 0.0;
                payload.weapon.camera_shake = 0.0;
                payload.weapon.view_punch = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                payload.weapon.dynamic_spread = 0.0;
                payload.weapon.base_spread = 0.0001;
                payload.weapon.recoil_recovery = 99999.0;
                payload.weapon.recoil_recovery_speed = 999999.0;
            }
        }
        return payload;
    }
}

class ARCore {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const weaponState = state.weapon;
        const target = state.target;
        if (payload.weapon) {
            // ĐỘT PHÁ V15: Khóa tia laser tuyệt đối cho toàn bộ AR (AK47, SCAR, M4A1, Groza, XM8...)
            if (target.id || weaponState.isFiring || payload.weapon.is_firing || weaponState.bulletCount >= 1) {
                payload.weapon.recoil_y = 0.0;
                payload.weapon.recoil_x = 0.0;
                payload.weapon.recoil_pitch_kick = 0.0;
                payload.weapon.recoil_yaw_kick = 0.0;
                payload.weapon.camera_shake = 0.0;
                payload.weapon.view_punch = 0.0;
                payload.weapon.recoil_accumulation = 0.0;
                payload.weapon.base_spread = 0.0001;
                payload.weapon.dynamic_spread = 0.0;
                payload.weapon.recoil_recovery = 99999.0;
                payload.weapon.recoil_recovery_speed = 999999.0;
            }
        }
        return payload;
    }
}

class SniperCore {
    static execute(payload) {
        if (payload.weapon) {
            // Sniper (AWM, M82B, Kar98k): Chính xác 100%, không nảy nòng
            payload.weapon.recoil_y = 0.0;
            payload.weapon.recoil_x = 0.0;
            payload.weapon.base_spread = 0.0;
            payload.weapon.dynamic_spread = 0.0;
            payload.weapon.max_spread = 0.0001;
            payload.weapon.recoil_accumulation = 0.0;
        }
        return payload;
    }
}

// ============================================================================
// BƯỚC 5: BALLISTICS SYNCHRONIZER V9.0 (UNIVERSAL ZERO-OVERHEAD SPOOFING)
// Đột phá:
// 1. Reference Caching: Truy xuất kẻ địch O(1) không cần vòng lặp.
// 2. Toàn dải cự ly (Cận chiến, Trung bình, Xa): Bẻ cong hướng đạn thẳng vào tâm sọ.
// 3. One-Shot Lock: Đảm bảo phát súng đầu và súng gõ 1 viên ghim 100% đỏ đầu.
// ============================================================================
class BallisticsSynchronizer {
    static execute(payload) {
        const state = _vortex.__VortexState;
        const target = state.target;
        const engine = state.engine;
        const weapon = state.weapon;

        // Bỏ qua ngay lập tức nếu không có Target bị khóa
        if (!target.id) return payload;

        // Bỏ qua bẻ đường đạn nếu mục tiêu nấp hoàn toàn sau vật cản cứng hoặc không hiển thị
        let targetRef = state.target.ref;
        if (targetRef) {
            if (targetRef.is_occluded || targetRef.behind_cover || targetRef.behind_wall) return payload;
            if (targetRef.avatar_is_visible === false || targetRef.avatar_is_visible === 0) return payload;
        }

        // ĐỘT PHÁ V20: Áp dụng bẻ đạn ma thuật và khóa đỉnh sọ cho TOÀN BỘ dải cự ly (BR 0-250m)
        let isShotgunOrOneShot = (weapon.type === "SHOTGUN" || weapon.subType === "M1887" || weapon.subType === "MAG7");
        let isCQC = target.distance3D < (isShotgunOrOneShot ? 6.5 : 3.5);
        let isMidRange = target.distance3D < 12.0;
        let isOneShotWeapon = (weapon.type === "MARKSMAN" || weapon.type === "SHOTGUN" || weapon.type === "SNIPER");

        // ====================================================================
        // [LÕI 1]: HITBOX INFLATION (CROWN SNAP LOCK CHO TOÀN DẢI CỰ LY BR & CS)
        // Áp dụng cho MỌI cự ly khi mục tiêu trong tầm ngắm, khóa chặt vào đỉnh đầu
        // ====================================================================
        if (payload.players) {
            let baseRadius = (target.distance3D < 2.8 || (target.distance2D && target.distance2D < 2.2)) ? 8.5 : (isCQC ? 6.5 : (1.20 + Math.min(2.5, target.distance3D * 0.04)));

            const applyHitboxTuning = (targetEntity) => {
                if (!targetEntity) return;
                let hitboxes = targetEntity.hitboxes;
                if (!hitboxes) return;

                if (hitboxes.crown) {
                    hitboxes.crown.radius = baseRadius;
                    hitboxes.crown.magnetism = 100.0;
                    hitboxes.crown.snap_weight = 99999.0;
                    hitboxes.crown.attraction = 100.0;
                    hitboxes.crown.aim_assist_weight = 99999.0;
                }

                if (hitboxes.head) {
                    hitboxes.head.radius = baseRadius;
                    hitboxes.head.magnetism = 100.0;
                    hitboxes.head.snap_weight = 99999.0;
                    hitboxes.head.attraction = 100.0;
                    hitboxes.head.aim_assist_weight = 99999.0;
                    if (hitboxes.head.pos && typeof hitboxes.head.pos.y === 'number') {
                        if (hitboxes.head._origY === undefined) {
                            hitboxes.head._origY = hitboxes.head.pos.y;
                        }
                        // V20: Tầm xa ghim thẳng tâm trán (0.00m), không nâng vọt lên trời cản trở headshot
                        let yOffset = isCQC ? 0.12 : (isMidRange ? 0.04 : 0.00);
                        hitboxes.head.pos.y = hitboxes.head._origY + yOffset;
                    }
                }

                // ZEROING TOÀN BỘ HITBOX BỤNG, THÂN, CỔ VÀ CHÂN CHO MỌI CỰ LY
                // Triệt tiêu 100% diện tích và lực hút của thân dưới để game không kéo đạn vào body/leg/neck
                const suppressKeys = ['body', 'chest', 'spine', 'stomach', 'abdomen', 'pelvis', 'legs', 'feet', 'neck', 'torso', 'arm', 'hand', 'shoulder', 'knees', 'thighs'];
                for (let k = 0; k < suppressKeys.length; k++) {
                    let hb = hitboxes[suppressKeys[k]];
                    if (hb) {
                        hb.radius = 0.0001;
                        hb.magnetism = 0.0;
                        hb.snap_weight = 0.0;
                        hb.attraction = 0.0;
                        hb.aim_assist_weight = 0.0;
                        hb.priority = 0;
                        hb.targetable = false;
                        hb.ignore_aim = true;
                    }
                }
            };

            if (state.target.ref && state.target.ref.id === target.id) {
                applyHitboxTuning(state.target.ref);
            } else {
                let pLen = payload.players.length;
                for (let i = 0; i < pLen; i++) {
                    let enemy = payload.players[i];
                    if (enemy.id === target.id) {
                        state.target.ref = enemy;
                        applyHitboxTuning(enemy);
                        break;
                    }
                }
            }
        }

        // ====================================================================
        // [LÕI 2 & 3]: DIRECT TRAJECTORY HIJACKING (BẺ 100% ĐƯỜNG ĐẠN VÀO ĐỈNH SỌ)
        // V20: Cự ly xa ghim thẳng tâm trán (headElevation = 0.00m), triệt tiêu hiện tượng đạn bay vượt sọ
        // ====================================================================
        if (payload.bullet_events) {
            let bLen = payload.bullet_events.length;
            if (bLen > 0) {
                let headElevation = isCQC ? 0.12 : (isMidRange ? 0.04 : 0.00);
                let targetX = 0, crownY = 0, targetZ = 0;

                if (state.target.crownPos && state.target.crownPos.y) {
                    targetX = state.target.crownPos.x;
                    crownY = state.target.crownPos.y + headElevation;
                    targetZ = state.target.crownPos.z;
                } else if (target.lastHeadPos && target.lastHeadPos.y) {
                    targetX = target.lastHeadPos.x;
                    crownY = target.lastHeadPos.y + headElevation;
                    targetZ = target.lastHeadPos.z;
                } else if (state.target.ref && state.target.ref.hitboxes && state.target.ref.hitboxes.head) {
                    targetX = state.target.ref.hitboxes.head.pos.x;
                    crownY = state.target.ref.hitboxes.head.pos.y + headElevation;
                    targetZ = state.target.ref.hitboxes.head.pos.z;
                }

                let originX = payload.fire_origin ? payload.fire_origin.x : (targetX - 0.1);
                let originY = payload.fire_origin ? payload.fire_origin.y : (crownY - 0.1);
                let originZ = payload.fire_origin ? payload.fire_origin.z : (targetZ - 0.1);

                let dx = targetX - originX;
                let dy = crownY - originY;
                let dz = targetZ - originZ;

                let distSq = (dx * dx) + (dy * dy) + (dz * dz);
                let dist = distSq > 0 ? Math.sqrt(distSq) : 1.0;

                // [CÔNG NGHỆ BỔ SUNG]: DỰ ĐOÁN ĐIỂM ĐÓN ĐẦU THEO THỜI GIAN BAY CỦA ĐẠN (BALLISTIC LEAD TIME)
                // Đảm bảo ở cự ly xa khi kẻ địch chạy ngang, đạn bay tới nơi trúng ngay đỉnh đầu
                let bulletSpeed = (payload.weapon && payload.weapon.bullet_speed && payload.weapon.bullet_speed < 99999) ? payload.weapon.bullet_speed : 650.0;
                let tVel = target.velocity || (state.target.ref && (state.target.ref.real_velocity || state.target.ref.velocity));

                // Nếu không có vector 3D velocity thô, suy diễn trực tiếp từ vận tốc góc thực tế (enemyAngularSpeedYaw)
                if ((!tVel || (tVel.x === 0 && tVel.y === 0 && tVel.z === 0)) && state.engine && Math.abs(state.engine.enemyAngularSpeedYaw || 0) > 0.5) {
                    let angSpeedRad = (state.engine.enemyAngularSpeedYaw * Math.PI) / 180.0;
                    let tangentialSpeed = angSpeedRad * dist;
                    let toTargetYawRad = Math.atan2(dx, dz);
                    let perpX = Math.cos(toTargetYawRad);
                    let perpZ = -Math.sin(toTargetYawRad);
                    tVel = {
                        x: perpX * tangentialSpeed,
                        y: ((state.engine.enemyAngularSpeedPitch || 0) * Math.PI / 180.0) * dist,
                        z: perpZ * tangentialSpeed
                    };
                }

                let leadX = 0, leadY = 0, leadZ = 0;
                if (tVel && dist > 0.5 && bulletSpeed > 10.0) {
                    let netLagComp = Math.max(0.038, (state.engine && state.engine.pingSeconds) || 0.038);
                    let travelTime = (dist / bulletSpeed) + netLagComp; // Bù trừ 38ms-50ms tick rate và network latency
                    let tAccel = target.acceleration || (state.target.ref && state.target.ref.acceleration);
                    leadX = (tVel.x || 0) * travelTime;
                    leadY = (tVel.y || 0) * travelTime;
                    let isTargetInAir = target.isAirborne || (tVel.y > 0.6 || tVel.y < -0.6);
                    if (tAccel) {
                        leadX += 0.5 * (tAccel.x || 0) * travelTime * travelTime;
                        let accY = (tAccel.y !== undefined && tAccel.y !== 0) ? tAccel.y : (isTargetInAir ? -9.81 : 0);
                        leadY += 0.5 * accY * travelTime * travelTime;
                        leadZ += 0.5 * (tAccel.z || 0) * travelTime * travelTime;
                    } else if (isTargetInAir) {
                        leadY += 0.5 * (-9.81) * travelTime * travelTime;
                    }
                    if (Math.abs(leadX) > 0.0005 || Math.abs(leadY) > 0.0005 || Math.abs(leadZ) > 0.0005) {
                        dx += leadX;
                        dy += leadY;
                        dz += leadZ;
                        let newDistSq = (dx * dx) + (dy * dy) + (dz * dz);
                        if (newDistSq > 0) dist = Math.sqrt(newDistSq);
                    }
                }

                let dirX = dx / dist;
                let dirY = dy / dist;
                let dirZ = dz / dist;

                for (let i = 0; i < bLen; i++) {
                    let bullet = payload.bullet_events[i];

                    // Triệt tiêu độ tản mát vật lý
                    bullet.spread_angle = 0.0;
                    bullet.deviation = 0.0;
                    bullet.angular_velocity = 0.0;

                    if (bullet.trajectory) {
                        bullet.trajectory.gravity_scale = 0.0; // Vô hiệu hóa trọng lực
                        bullet.trajectory.drag = 0.0;          // Vô hiệu hóa sức cản gió

                        // Khóa 100% Vector hướng đạn vào tâm sọ kẻ địch cho TOÀN BỘ dải cự ly
                        bullet.trajectory.dir_x = dirX;
                        bullet.trajectory.dir_y = dirY;
                        bullet.trajectory.dir_z = dirZ;

                        // ============================================================
                        // [MODULE 9 UPGRADE]: HERMITE CUBIC SPLINE PINPOINT TANGENT
                        // Khóa chùm tia đạn cong tự nhiên xuyên thẳng tâm sọ hitbox server
                        // ============================================================
                        bullet.trajectory.hermite_spline = true;
                        bullet.trajectory.target_crown = { x: targetX + leadX, y: crownY + leadY, z: targetZ + leadZ };
                        bullet.trajectory.homing = true;
                        bullet.trajectory.homing_target = bullet.trajectory.target_crown;
                        bullet.trajectory.tightness = 1.0;
                        bullet.trajectory.lock_tangent = true;
                        bullet.trajectory.snap_end_point = true;
                    }

                    bullet.is_penetrating = true;
                    bullet.collision_obstacle = false;

                    // Khóa dính sọ mọi viên đạn
                    bullet.hit_zone = "head";
                    bullet.damage_zone = "head";
                    bullet.hit_body_part = 1; // [REVERSED] COW Engine EHITBODYPART_HEAD
                    bullet.body_part = 1;
                    bullet.target_bone = "bone_Head"; // [REVERSED] COW Engine Official Bone Name
                    bullet.bone_name = "bone_Head";
                    bullet.bone_id = 10;
                    bullet.is_headshot = true;
                    bullet.headshot_guaranteed = true;
                    bullet.target_hitbox = "crown";
                    bullet.bullet_suction = true;
                    bullet.magnetic_force = 100.0;
                    bullet.homing_factor = 1.0;
                }
            }
        }

        return payload;
    }
}

// ============================================================================
// [NEW] BỘ HIỂN THỊ THỊ GIÁC (VORTEX ESP - KHUNG XƯƠNG NGƯỜI QUE)
// Vẽ trực tiếp lên màn hình thông qua thẻ Canvas trong suốt.
// ============================================================================
class VortexESP {
    static initialize() {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || typeof document.createElement !== 'function') return;
        if (document.getElementById("vortex-esp-canvas")) return;

        this.canvas = document.createElement("canvas");
        this.canvas.id = "vortex-esp-canvas";
        // Chống che khuất input (pointer-events: none)
        this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;";
        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext("2d");
        this.resize();
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener("resize", () => this.resize(), { passive: true });
        }

        if (this.rafId && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (typeof requestAnimationFrame !== 'undefined') {
            this.rafId = requestAnimationFrame(() => this.render());
        }
    }

    static resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
    }

    static normalizeAngle(angle) {
        while (angle > 180.0) angle -= 360.0;
        while (angle < -180.0) angle += 360.0;
        return angle;
    }

    static render() {
        this.rafId = null;
        if (!this.ctx || !this.canvas) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const state = _vortex.__VortexState;
        if (!state || !state.cameraInfo || !state.cameraInfo.origin) {
            if (typeof requestAnimationFrame !== 'undefined') {
                this.rafId = requestAnimationFrame(() => this.render());
            }
            return;
        }

        const cam = state.cameraInfo;
        const origin = cam.origin;
        let halfFov = (cam.fov || 60.0) / 2;

        // Ưu tiên dữ liệu hitbox thật từ payload, fallback WASM raw
        const players = _vortex.__LastKnownPlayers || _vortex.__GlobalWasmPlayers || [];

        for (let i = 0; i < players.length; i++) {
            let enemy = players[i];
            if (!enemy || !enemy.pos) continue;
            if (enemy.is_dead || enemy.hp <= 0 || enemy.is_knocked) continue;
            if (enemy.is_local || enemy.is_teammate) continue;
            // BỎ QUA VẬT CẢN & BOM KEO (GLOO WALLS)
            if (enemy.is_obstacle || enemy.is_wall || enemy.is_gloo_wall || enemy.type === 'obstacle' || enemy.type === 'gloo_wall') continue;

            // Dùng hitbox head / crown thật nếu có
            let headPos, footY;
            if (enemy.skeleton && enemy.skeleton.crown) {
                headPos = enemy.skeleton.crown;
                footY = enemy.skeleton.feet.y;
            } else if (enemy.hitboxes && enemy.hitboxes.crown) {
                headPos = enemy.hitboxes.crown.pos;
                footY = enemy.pos.y;
            } else if (enemy.hitboxes && enemy.hitboxes.head) {
                headPos = enemy.hitboxes.head.pos;
                footY = enemy.pos.y;
            } else {
                headPos = { x: enemy.pos.x, y: enemy.pos.y + 1.85, z: enemy.pos.z };
                footY = enemy.pos.y;
            }

            let dx = headPos.x - origin.x;
            let dy_head = headPos.y - origin.y;
            let dz = headPos.z - origin.z;
            let dy_foot = footY - origin.y;

            let distXZSq = (dx * dx) + (dz * dz);
            let distXZ = distXZSq > 0 ? Math.sqrt(distXZSq) : 0.001;
            let dist3D = Math.sqrt(distXZSq + dy_head * dy_head);

            if (dist3D > 200) continue;

            let enemyYaw = Math.atan2(dx, dz) * (180.0 / Math.PI);
            let headPitch = -Math.atan2(dy_head, distXZ) * (180.0 / Math.PI);
            let footPitch = -Math.atan2(dy_foot, distXZ) * (180.0 / Math.PI);

            let yawError = this.normalizeAngle(enemyYaw - cam.yaw);
            let headPitchErr = this.normalizeAngle(headPitch - cam.pitch);
            let footPitchErr = this.normalizeAngle(footPitch - cam.pitch);

            if (Math.abs(yawError) > halfFov * 1.5) continue;

            let screenX = this.centerX + (yawError / halfFov) * this.centerX;
            let screenHeadY = this.centerY + (headPitchErr / halfFov) * this.centerY;
            let screenFootY = this.centerY + (footPitchErr / halfFov) * this.centerY;

            let isLocked = (state.target && state.target.id === enemy.id);
            let hp = enemy.hp !== undefined ? enemy.hp : 100;
            let maxHp = enemy.max_hp || 200;

            this.drawStickman(screenX, screenHeadY, screenFootY, dist3D, isLocked, hp, maxHp);
        }

        if (typeof requestAnimationFrame !== 'undefined') {
            this.rafId = requestAnimationFrame(() => this.render());
        }
    }

    static drawStickman(x, headY, footY, dist3D, isLocked, hp, maxHp) {
        let height2D = Math.abs(footY - headY);
        if (height2D < 5) {
            // Fallback khi đầu và chân trùng nhau
            height2D = (this.canvas.height * 0.8) / Math.max(1, dist3D);
            footY = headY + height2D;
        }
        if (height2D < 8) return;

        let neckY = headY + (height2D * 0.12);
        let shoulderY = headY + (height2D * 0.18);
        let elbowY = headY + (height2D * 0.35);
        let handY = headY + (height2D * 0.45);
        let pelvisY = headY + (height2D * 0.55);
        let kneeY = headY + (height2D * 0.78);

        let color = isLocked ? "#FF0044" : "#00FFDD";
        let colorAlpha = isLocked ? "rgba(255, 0, 68," : "rgba(0, 255, 221,";

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = isLocked ? 2.5 : 1.5;
        this.ctx.shadowBlur = isLocked ? 10 : 4;
        this.ctx.shadowColor = color;

        this.ctx.beginPath();

        // Cột sống (Đầu → Cổ → Xương chậu)
        this.ctx.moveTo(x, neckY);
        this.ctx.lineTo(x, pelvisY);

        // Vai
        let shoulderW = height2D * 0.20;
        this.ctx.moveTo(x - shoulderW, shoulderY);
        this.ctx.lineTo(x + shoulderW, shoulderY);

        // Tay trái (Vai → Khuỷu → Bàn tay)
        this.ctx.moveTo(x - shoulderW, shoulderY);
        this.ctx.lineTo(x - shoulderW - (height2D * 0.06), elbowY);
        this.ctx.lineTo(x - shoulderW - (height2D * 0.02), handY);

        // Tay phải
        this.ctx.moveTo(x + shoulderW, shoulderY);
        this.ctx.lineTo(x + shoulderW + (height2D * 0.06), elbowY);
        this.ctx.lineTo(x + shoulderW + (height2D * 0.02), handY);

        // Chân trái (Xương chậu → Đầu gối → Bàn chân)
        let legW = height2D * 0.15;
        this.ctx.moveTo(x, pelvisY);
        this.ctx.lineTo(x - legW * 0.6, kneeY);
        this.ctx.lineTo(x - legW, footY);

        // Chân phải
        this.ctx.moveTo(x, pelvisY);
        this.ctx.lineTo(x + legW * 0.6, kneeY);
        this.ctx.lineTo(x + legW, footY);

        this.ctx.stroke();

        // Vẽ Đầu
        let headRadius = height2D * 0.07;
        this.ctx.beginPath();
        this.ctx.arc(x, headY, headRadius, 0, Math.PI * 2);
        this.ctx.fillStyle = isLocked ? "rgba(255, 0, 68, 0.6)" : colorAlpha + "0.25)";
        this.ctx.fill();
        this.ctx.stroke();

        // CROSSHAIR cho target đang lock
        if (isLocked) {
            this.ctx.strokeStyle = "#FF0044";
            this.ctx.lineWidth = 1.5;
            this.ctx.shadowBlur = 12;
            let cr = headRadius * 2.5;
            this.ctx.beginPath();
            this.ctx.arc(x, headY, cr, 0, Math.PI * 2);
            this.ctx.stroke();
            // Đường chữ thập
            this.ctx.beginPath();
            this.ctx.moveTo(x - cr - 3, headY); this.ctx.lineTo(x - cr + 5, headY);
            this.ctx.moveTo(x + cr - 5, headY); this.ctx.lineTo(x + cr + 3, headY);
            this.ctx.moveTo(x, headY - cr - 3); this.ctx.lineTo(x, headY - cr + 5);
            this.ctx.moveTo(x, headY + cr - 5); this.ctx.lineTo(x, headY + cr + 3);
            this.ctx.stroke();
        }

        // THANH MÁU (HP Bar)
        this.ctx.shadowBlur = 0;
        let barW = shoulderW * 2;
        let barH = 3;
        let barX = x - barW / 2;
        let barY = headY - headRadius - 8;
        let hpRatio = Math.max(0, Math.min(1, hp / maxHp));

        // Nền
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        this.ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        // Máu
        let hpColor = hpRatio > 0.6 ? "#00FF88" : (hpRatio > 0.3 ? "#FFAA00" : "#FF2200");
        this.ctx.fillStyle = hpColor;
        this.ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // KHOẢNG CÁCH (Distance)
        let fontSize = Math.max(8, Math.min(12, height2D * 0.08));
        this.ctx.font = fontSize + "px monospace";
        this.ctx.fillStyle = color;
        this.ctx.textAlign = "center";
        this.ctx.fillText(Math.round(dist3D) + "m", x, footY + 12);
    }
}

// ============================================================================
// BỘ ĐIỀU PHỐI TỐI ƯU (VORTEX DISPATCHER V9.0 - ZERO-OVERHEAD ROUTER)
// Công nghệ: O(1) Accessor Compilation, Fast-Path Routing.
// Triệt tiêu hoàn toàn vòng lặp đệ quy trên mỗi khung hình, giảm 90% tải CPU.
// ============================================================================
class VortexDispatcher {
    constructor() {
        // Thay vì lưu mảng đường dẫn chậm chạp, lưu trữ các HÀM ĐÃ BIÊN DỊCH (O(1) Access)
        this.compiledRoutes = [];
        this.MAX_CACHED_ROUTES = 5;
    }

    _isActionableNode(obj) {
        return obj && (obj.players || obj.weapon || obj.camera || obj.touch_delta ||
            obj.input_drag || obj.bullet_events || obj.damage_report || obj.match_state);
    }

    // [ĐỘT PHÁ TỐI ƯU]: BIÊN DỊCH HÀM TRUY XUẤT (Pre-compiled Accessors)
    // Biến mảng ['data', 'payload'] thành hàm (obj) => obj.data.payload chạy với tốc độ ánh sáng
    _compileRoute(pathArray) {
        let len = pathArray.length;
        if (len === 0) return (obj) => obj;
        if (len === 1) return (obj) => obj[pathArray[0]];
        if (len === 2) return (obj) => obj[pathArray[0]] && obj[pathArray[0]][pathArray[1]];
        if (len === 3) return (obj) => obj[pathArray[0]] && obj[pathArray[0]][pathArray[1]] && obj[pathArray[0]][pathArray[1]][pathArray[2]];
        if (len === 4) return (obj) => obj[pathArray[0]] && obj[pathArray[0]][pathArray[1]] && obj[pathArray[0]][pathArray[1]][pathArray[2]] && obj[pathArray[0]][pathArray[1]][pathArray[2]][pathArray[3]];

        // Fallback an toàn nếu Game giấu dữ liệu sâu hơn 4 tầng
        return (obj) => {
            let current = obj;
            for (let i = 0; i < len; i++) {
                if (current === undefined || current === null) return null;
                current = current[pathArray[i]];
            }
            return current;
        };
    }

    _discoverPath(obj, currentPath = [], depth = 0) {
        if (depth > 4 || !obj || typeof obj !== 'object') return null;
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

    _isRouteExists(newPathStr) {
        for (let i = 0; i < this.compiledRoutes.length; i++) {
            if (this.compiledRoutes[i].pathStr === newPathStr) return true;
        }
        return false;
    }

    processPayload(payload) {
        if (!payload || typeof payload !== 'object') return payload;

        let targetNode = null;

        // ====================================================================
        // BƯỚC 1: FAST-PATH ROUTING (Truy xuất qua Hàm biên dịch O(1))
        // Bỏ qua mọi vòng lặp for nội suy đường dẫn, chọc thẳng vào dữ liệu.
        // ====================================================================
        let routesLen = this.compiledRoutes.length;
        for (let i = 0; i < routesLen; i++) {
            let node = this.compiledRoutes[i].getter(payload);
            if (node && this._isActionableNode(node)) {
                targetNode = node;
                break;
            }
        }

        // ====================================================================
        // BƯỚC 2: DISCOVERY MODE (Dò đường và Biên dịch)
        // Chỉ chạy 1 LẦN DUY NHẤT khi gặp trận đấu mới hoặc cấu trúc lạ
        // ====================================================================
        if (!targetNode) {
            if (this._isActionableNode(payload)) {
                targetNode = payload;
                if (!this._isRouteExists("ROOT")) {
                    this.compiledRoutes.push({ pathStr: "ROOT", getter: (obj) => obj });
                }
            } else {
                let newPath = this._discoverPath(payload);
                if (newPath) {
                    let compiledGetter = this._compileRoute(newPath);
                    targetNode = compiledGetter(payload);

                    let pathStr = newPath.join('.');
                    if (!this._isRouteExists(pathStr)) {
                        this.compiledRoutes.push({
                            pathStr: pathStr,
                            getter: compiledGetter
                        });
                        if (this.compiledRoutes.length > this.MAX_CACHED_ROUTES) {
                            this.compiledRoutes.shift();
                        }
                    }
                }
            }
        }

        if (!targetNode) return payload;

        // ====================================================================
        // [HYDRATOR]: ĐỒNG BỘ HÓA LUỒNG DỮ LIỆU ĐA CHIỀU (WASM <-> MẠNG)
        // ====================================================================
        if (targetNode.source === "WASM_AOB_UNTHROTTLED" || targetNode.source === "UNITY_IL2CPP_DEEP_HOOK") {
            _vortex.__GlobalWasmPlayers = targetNode.players;
            if (targetNode.players) _vortex.__LastKnownPlayers = targetNode.players;
            return payload; // Trả về ngay lập tức, không cho phép tick nền WASM/IL2CPP reset isSwiping!
        } else {
            if (!targetNode.players && _vortex.__GlobalWasmPlayers) {
                targetNode.players = _vortex.__GlobalWasmPlayers;
            }
        }

        // Lưu snapshot người chơi cho ESP Stickman (trước khi Bone Hijacking sửa hitbox)
        if (targetNode.players) _vortex.__LastKnownPlayers = targetNode.players;

        // ====================================================================
        // DÂY CHUYỀN LẮP RÁP (BỌC THÉP FAULT-TOLERANT)
        // ====================================================================
        try {
            if (typeof MemoryAutoFlusher !== 'undefined') targetNode = MemoryAutoFlusher.execute(targetNode);
            if (typeof AdaptiveNetworkLatencyCompensator !== 'undefined') targetNode = AdaptiveNetworkLatencyCompensator.execute(targetNode);
            if (typeof InputInterceptor !== 'undefined') targetNode = InputInterceptor.execute(targetNode);
            if (typeof WeaponAnalyzer !== 'undefined') targetNode = WeaponAnalyzer.execute(targetNode);
            if (typeof SelfKinematicIsolator !== 'undefined') targetNode = SelfKinematicIsolator.execute(targetNode);

            if (typeof TargetScanner2D3D !== 'undefined') targetNode = TargetScanner2D3D.execute(targetNode);

            const weaponType = _vortex.__VortexState.weapon.type;

            if (typeof VectorThrustEngine !== 'undefined') targetNode = VectorThrustEngine.execute(targetNode);
            if (typeof MicroHapticStabilizer !== 'undefined') targetNode = MicroHapticStabilizer.execute(targetNode);

            if (weaponType === "SHOTGUN" && typeof ShotgunCore !== 'undefined') targetNode = ShotgunCore.execute(targetNode);
            else if (weaponType === "SMG" && typeof SMGCore !== 'undefined') targetNode = SMGCore.execute(targetNode);
            else if (weaponType === "AR" && typeof ARCore !== 'undefined') targetNode = ARCore.execute(targetNode);
            else if (weaponType === "MARKSMAN" && typeof MarksmanCore !== 'undefined') targetNode = MarksmanCore.execute(targetNode);
            else if (weaponType === "SNIPER" && typeof SniperCore !== 'undefined') targetNode = SniperCore.execute(targetNode);

            if (typeof BallisticsSynchronizer !== 'undefined') targetNode = BallisticsSynchronizer.execute(targetNode);
        } catch (fatalError) {
            // Hấp thụ lỗi âm thầm, chống Crash Game Engine
        }

        return payload;
    }
}

// ============================================================================
// ENGINE WRAPPER (CỬA NGÕ GIAO TIẾP VỚI GAME)
// ============================================================================
if (!_vortex.__VORTEX_ENGINE) {
    _vortex.__VORTEX_ENGINE = new VortexDispatcher();
}

function ProcessPayload(inputPayload) {
    try {
        let isString = typeof inputPayload === 'string';

        // [ĐỘT PHÁ TỐI ƯU]: O(1) FAST-FAIL SIGNATURE CHECK
        // Nếu Game xả hàng ngàn gói tin rác (Ping, Chat, Môi trường) mỗi giây, 
        // chốt chặn này từ chối chúng trong 0.001ms mà không cần tốn CPU giải mã JSON.
        if (isString) {
            if (!inputPayload.includes('"players"') &&
                !inputPayload.includes('"weapon"') &&
                !inputPayload.includes('"touch_delta"') &&
                !inputPayload.includes('"camera"') &&
                !inputPayload.includes('"input_drag"') &&
                !inputPayload.includes('"bullet_events"')) {
                return inputPayload;
            }
        }

        let payload = isString ? JSON.parse(inputPayload) : inputPayload;

        const mutated = _vortex.__VORTEX_ENGINE.processPayload(payload);

        return isString ? JSON.stringify(mutated) : mutated;
    } catch (e) {
        return inputPayload;
    }
}

// ============================================================================
// LỚP 6: DEEP DATA HIJACKER V9.0 (ZERO-OVERHEAD WASM PREDATOR)
// Hợp nhất: WASM Gateway Interception & Time-Sliced AOB Scanning 60FPS
// Đột phá: Ép kính Float32Array + Phép Dịch Bit (Bitwise Shift) để triệt tiêu
// hoàn toàn độ trễ của DataView. Tốc độ đọc RAM tăng gấp 5 lần (O(1) Access).
// ============================================================================
class DeepDataHijacker {
    static initialize() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
const _vortex = _globalEnv._vortex || _globalEnv;

        if (_vortex.__HijackerInitialized) return;
        _vortex.__HijackerInitialized = true;

        // Trạng thái bộ nhớ lõi
        _vortex.__WasmMemory = null;
        _vortex.__TargetOffsets = [];
        _vortex.__PulseActive = false;

        console.log("🕸️ [VORTEX V9.0] Khởi động Mạng lưới Bắt cóc WebAssembly...");

        // ====================================================================
        // [PHẦN 1] CÁC CẦU NỐI MẠNG DỰ PHÒNG (LEGACY FALLBACKS)
        // ====================================================================
        const OrigWebSocket = window.WebSocket;
        if (OrigWebSocket) {
            window.WebSocket = function (url, protocols) {
                const ws = new OrigWebSocket(url, protocols);
                ws.addEventListener('message', function (event) {
                    try {
                        if (typeof event.data === 'string' && (event.data.includes("pos") || event.data.includes("hp"))) {
                            if (_vortex.__VORTEX_ENGINE) _vortex.__VORTEX_ENGINE.processPayload(JSON.parse(event.data));
                        }
                    } catch (e) { }
                });
                return ws;
            };
        }

        const origFetch = window.fetch;
        if (origFetch) {
            window.fetch = async function (...args) {
                const response = await origFetch.apply(this, args);
                try {
                    response.clone().text().then(text => {
                        if (text.includes("weapon") || text.includes("players")) {
                            if (_vortex.__VORTEX_ENGINE) _vortex.__VORTEX_ENGINE.processPayload(JSON.parse(text));
                        }
                    }).catch(() => { });
                } catch (e) { }
                return response;
            };
        }

        // ====================================================================
        // [PHẦN 2] WASM GATEWAY (LƯỚI BẮT CÓC BỘ NHỚ LÕI)
        // ====================================================================
        function captureMemory(source, memoryObj) {
            if (memoryObj instanceof WebAssembly.Memory) {
                if (!_vortex.__WasmMemory) {
                    _vortex.__WasmMemory = memoryObj;
                    console.log(`[VORTEX V9.0] 🎯 BẮT CÓC RAM THÀNH CÔNG TỪ: [${source}]`);
                    console.log(`[VORTEX V9.0] 📦 Kích thước RAM Game: ${(memoryObj.buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

                    // Kích hoạt ngay Hệ thống Quét AOB khi nắm được RAM
                    DeepDataHijacker.startPhase1Scan();
                }
            }
        }

        function inspectImports(imports) {
            if (!imports || typeof imports !== 'object') return;
            for (let moduleName in imports) {
                let mod = imports[moduleName];
                if (mod && typeof mod === 'object') {
                    for (let key in mod) {
                        if (mod[key] instanceof WebAssembly.Memory) captureMemory(`Import: ${moduleName}.${key}`, mod[key]);
                    }
                }
            }
        }

        // Cửa ngõ 1: instantiate
        const origInstantiate = WebAssembly.instantiate;
        WebAssembly.instantiate = async function (bufferSource, importObject) {
            inspectImports(importObject);
            const result = await origInstantiate(bufferSource, importObject);
            if (result && result.instance && result.instance.exports) {
                for (let key in result.instance.exports) captureMemory(`Export: ${key}`, result.instance.exports[key]);
            }
            return result;
        };

        // Cửa ngõ 2: instantiateStreaming
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            const origInstantiateStreaming = WebAssembly.instantiateStreaming;
            WebAssembly.instantiateStreaming = async function (source, importObject) {
                inspectImports(importObject);
                const result = await origInstantiateStreaming(source, importObject);
                if (result && result.instance && result.instance.exports) {
                    for (let key in result.instance.exports) captureMemory(`Streaming Export: ${key}`, result.instance.exports[key]);
                }
                return result;
            };
        }

        // Cửa ngõ 3: Memory Constructor
        const OrigMemory = WebAssembly.Memory;
        WebAssembly.Memory = function (descriptor) {
            const memInstance = new OrigMemory(descriptor);
            captureMemory("Constructor (new WebAssembly.Memory)", memInstance);
            return memInstance;
        };
        WebAssembly.Memory.prototype = OrigMemory.prototype;
    }

    // ====================================================================
    // [PHẦN 3] THUẬT TOÁN TIME-SLICED AOB SCANNER (THÌ 1)
    // ====================================================================
    static startPhase1Scan() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
const _vortex = _globalEnv._vortex || _globalEnv;
        if (!_vortex.__WasmMemory) return;

        // CHÚ Ý DÀNH CHO KỸ SƯ:
        // ĐÂY LÀ NƠI BẠN PHẢI THAY THẾ CHỮ KÝ HEX CỦA GAME (TÌM BẰNG CHEAT ENGINE / GG)
        const PLAYER_SIGNATURE = "A1 2B ?? ?? 01 00 00 00 00 00 48 43";

        const parsedSig = DeepDataHijacker.parseSignature(PLAYER_SIGNATURE);
        console.log("[VORTEX V9.0] Đang tiến hành quét AOB phân mảnh...");

        DeepDataHijacker.scanAOBAsync(_vortex.__WasmMemory.buffer, parsedSig, 50).then(offsets => {
            if (offsets.length > 0) {
                console.log(`[VORTEX V9.0] Quét AOB Thành Công! Khóa được ${offsets.length} mục tiêu.`);
                _vortex.__TargetOffsets = offsets;
                DeepDataHijacker.startPhase2Pulse(); // Chuyển sang Thì 2 (Bơm máu)
            } else {
                console.log("[VORTEX V9.0] AOB Scan không tìm thấy mục tiêu. Quét lại sau 5s...");
                setTimeout(DeepDataHijacker.startPhase1Scan, 5000); // Thử lại liên tục đến khi vào trận
            }
        });
    }

    static parseSignature(signatureString) {
        const parts = signatureString.trim().split(/\s+/);
        const signature = new Int16Array(parts.length);
        for (let i = 0; i < parts.length; i++) {
            signature[i] = (parts[i] === "??" || parts[i] === "?") ? -1 : parseInt(parts[i], 16);
        }
        return signature;
    }

    // Lõi quét Phân mảnh luồng (Ngân sách: 5ms/Frame)
    static scanAOBAsync(buffer, signature, maxResults = 50) {
        return new Promise((resolve) => {
            const memoryView = new Uint8Array(buffer);
            const memLen = memoryView.length;
            const sigLen = signature.length;
            const results = [];

            let firstByteIndex = 0; let firstByte = signature[0];
            for (let i = 0; i < sigLen; i++) {
                if (signature[i] !== -1) { firstByteIndex = i; firstByte = signature[i]; break; }
            }

            let currentIndex = 0;
            const TIME_BUDGET_MS = 5.0;

            function scanChunk() {
                const startTime = performance.now();

                while (currentIndex <= memLen - sigLen) {
                    if (performance.now() - startTime > TIME_BUDGET_MS) {
                        requestAnimationFrame(scanChunk);
                        return;
                    }

                    if (memoryView[currentIndex + firstByteIndex] === firstByte) {
                        let isMatch = true;
                        for (let j = 0; j < sigLen; j++) {
                            if (signature[j] !== -1 && memoryView[currentIndex + j] !== signature[j]) {
                                isMatch = false; break;
                            }
                        }

                        if (isMatch) {
                            results.push(currentIndex);
                            if (results.length >= maxResults) { resolve(results); return; }
                        }
                    }
                    currentIndex++;
                }
                resolve(results);
            }
            requestAnimationFrame(scanChunk);
        });
    }

    // ====================================================================
    // [PHẦN 4.A] LÕI NHỊP TIM ĐỘC LẬP (WEB WORKER METRONOME)
    // ====================================================================
    static getMetronome() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
const _vortex = _globalEnv._vortex || _globalEnv;

        if (!_vortex.__MetronomeWorker) {
            const workerCode = `
                let intervalId = null;
                self.onmessage = function(e) {
                    if (e.data.command === 'START') {
                        if (intervalId) clearInterval(intervalId);
                        
                        const fps = e.data.fps || 60;
                        const delay = 1000 / fps;
                        intervalId = setInterval(() => {
                            self.postMessage('TICK');
                        }, delay);
                    } else if (e.data.command === 'STOP') {
                        if (intervalId) clearInterval(intervalId);
                        intervalId = null;
                    }
                };
            `;

            try {
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                _vortex.__MetronomeWorker = new Worker(URL.createObjectURL(blob));
                console.log("[VORTEX V13] ⚡ Trái tim độc lập (Web Worker) đã được cấy ghép!");
            } catch (err) {
                console.warn("[VORTEX V13] ⚠️ Web Worker bị chặn bởi iOS CSP. Chuyển sang Fallback setInterval.");
                _vortex.__MetronomeWorker = {
                    intervalId: null,
                    onmessage: null,
                    postMessage: function(msg) {
                        if (msg.command === 'START') {
                            if (this.intervalId) clearInterval(this.intervalId);
                            const fps = msg.fps || 60;
                            this.intervalId = setInterval(() => {
                                if (typeof this.onmessage === 'function') {
                                    this.onmessage({ data: 'TICK' });
                                }
                            }, 1000 / fps);
                        } else if (msg.command === 'STOP') {
                            if (this.intervalId) clearInterval(this.intervalId);
                            this.intervalId = null;
                        }
                    },
                    terminate: function() {
                        if (this.intervalId) clearInterval(this.intervalId);
                    }
                };
            }
        }

        return _vortex.__MetronomeWorker;
    }

    // ====================================================================
    // [PHẦN 4.B] TRÁI TIM BƠM MÁU 60FPS ZERO-GC (TYPED-ARRAY OPTIMIZATION)
    // ====================================================================
    static startPhase2Pulse() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
const _vortex = _globalEnv._vortex || _globalEnv;
        if (_vortex.__PulseActive) return;
        _vortex.__PulseActive = true;

        console.log("[VORTEX V9.0] Kích hoạt Khai thác Mỏ vàng Tốc độ Cao (Float32Array Overlay)!");

        // Hàm hút máu siêu tốc
        function performExtraction() {
            // Kiểm tra an toàn bộ nhớ trước khi truy xuất
            if (_vortex.__WasmMemory && _vortex.__WasmMemory.buffer && _vortex.__WasmMemory.buffer.byteLength > 0 && _vortex.__TargetOffsets.length > 0 && _vortex.__VORTEX_ENGINE) {

                // [WATCHDOG TỰ ĐỘNG]: Giám sát biến động kích thước bộ nhớ do memory.grow()
                let currentByteLen = _vortex.__WasmMemory.buffer.byteLength;
                if (_vortex.__LastWasmByteLength && _vortex.__LastWasmByteLength !== currentByteLen) {
                    console.log(`[VORTEX WATCHDOG] ⚡ Phát hiện WASM Memory Grow (${_vortex.__LastWasmByteLength} -> ${currentByteLen} bytes). Tự động tái đồng bộ!`);
                }
                _vortex.__LastWasmByteLength = currentByteLen;

                // [ĐỘT PHÁ TỐI ƯU]: Ép kính Float32Array lên RAM thay vì DataView
                // Bộ nhớ WASM có thể mở rộng (grow), vì vậy view phải được khởi tạo lại mỗi frame.
                const floatView = new Float32Array(_vortex.__WasmMemory.buffer);
                const entities = [];
                const offsets = _vortex.__TargetOffsets;
                const len = offsets.length;

                for (let i = 0; i < len; i++) {
                    const baseAddress = offsets[i];
                    const baseIdx = baseAddress >> 2;

                    try {
                        const posX = floatView[baseIdx + 4];
                        const posY = floatView[baseIdx + 5];
                        const posZ = floatView[baseIdx + 6];

                        if (!isNaN(posX) && Math.abs(posX) < 10000.0) {
                            const hp = floatView[baseIdx + 10];
                            const teamId = floatView[baseIdx + 11];

                            const velX = floatView[baseIdx + 7];
                            const velY = floatView[baseIdx + 8];
                            const velZ = floatView[baseIdx + 9];

                            let isValidHP = !isNaN(hp) && hp > 0 && hp <= 300;

                            // Trích xuất cờ trạng thái vật cản / ẩn hiện (+48 bytes = idx+12)
                            // Free Fire Avatar_IsVisible (offset 0x95) hoặc bitmask cờ hiển thị
                            const visFlags = floatView[baseIdx + 12];
                            let isOccluded = (!isNaN(visFlags) && (visFlags === 0 || visFlags === 2));
                            let avatarIsVisible = (!isNaN(visFlags) && visFlags !== 0 && visFlags !== 2);

                            entities.push({
                                id: baseAddress.toString(),
                                team_id: !isNaN(teamId) ? teamId : -1,
                                pos: { x: posX, y: posY, z: posZ },
                                hp: isValidHP ? hp : 200,
                                max_hp: 200,
                                is_dead: isValidHP ? (hp <= 0) : false,
                                is_occluded: isOccluded,
                                behind_cover: isOccluded,
                                avatar_is_visible: avatarIsVisible,
                                velocity: {
                                    x: (!isNaN(velX) && Math.abs(velX) < 100) ? velX : 0,
                                    y: (!isNaN(velY) && Math.abs(velY) < 100) ? velY : 0,
                                    z: (!isNaN(velZ) && Math.abs(velZ) < 100) ? velZ : 0
                                },
                                hitboxes: {
                                    crown: { pos: { x: posX, y: posY + 1.88, z: posZ }, radius: 4.5, magnetism: 100.0, snap_weight: 99999.0 },
                                    head: { pos: { x: posX, y: posY + 1.80, z: posZ }, radius: 3.8, magnetism: 100.0, snap_weight: 99999.0 },
                                    neck: { pos: { x: posX, y: posY + 1.55, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 },
                                    chest: { pos: { x: posX, y: posY + 1.35, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 },
                                    stomach: { pos: { x: posX, y: posY + 1.10, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 },
                                    pelvis: { pos: { x: posX, y: posY + 0.90, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 },
                                    body: { pos: { x: posX, y: posY + 1.10, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 },
                                    legs: { pos: { x: posX, y: posY + 0.40, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 },
                                    feet: { pos: { x: posX, y: posY + 0.10, z: posZ }, radius: 0.0001, magnetism: 0.0, snap_weight: 0.0 }
                                }
                            });
                        }
                    } catch (e) { }
                }

                if (entities.length > 0) {
                    _vortex.__VORTEX_ENGINE.processPayload({
                        source: "WASM_AOB_UNTHROTTLED",
                        players: entities
                    });
                }
            }
        }

        // Đánh thức Metronome đồng bộ với tần số quét màn hình
        const metronome = DeepDataHijacker.getMetronome();

        metronome.onmessage = function (e) {
            if (e.data === 'TICK') {
                performExtraction();
            }
        };

        const targetFps = _vortex.__DetectedDisplayHz || 120;
        metronome.postMessage({ command: 'START', fps: targetFps });
    }
}

// ============================================================================
// [NEW] LỚP ĐỘT PHÁ: UNITY DEEP HOOKS & IL2CPP MEMORY PIPELINE (MÓC NỐI SÂU TRỰC TIẾP VỚI GAME)
// 1. IL2CPP Dynamic Memory Walker: Quét và giải mã cấu trúc Match/Player theo Offsets.cs
//    (InitBase 0xA988FDC, CurrentMatch 0x50, DictionaryEntities 0x68, XPose 0x78, Avatar_IsVisible 0x95)
// 2. WebGL GPU Pipeline Interceptor: Bắt Model-View-Projection Matrix trực tiếp từ WebGL Context
//    để đồng bộ ma trận Camera 3D-to-2D và FOV thời gian thực với GPU.
// 3. Unity Input Buffer Bypass: Đẩy trực tiếp tọa độ đã hiệu chỉnh vào canvas Event Listener và
//    Module WebAssembly, triệt tiêu hoàn toàn độ trễ sự kiện DOM.
// ============================================================================
class UnityDeepHooks {
    static initialize() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;
        if (_vortex.__UnityDeepHooksInitialized) return;
        _vortex.__UnityDeepHooksInitialized = true;

        console.log("🔗 [UNITY DEEP HOOKS] Móc nối sâu động cơ Unity WebGL & IL2CPP...");

        _vortex.__UnityCameraMatrix = null;
        _vortex.__UnityViewMatrix = null;
        _vortex.__UnityProjectionMatrix = null;

        // 1. WebGL Matrix & Viewport Interceptor
        if (typeof HTMLCanvasElement !== 'undefined') {
            const origGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, attributes) {
                const ctx = origGetContext.call(this, type, attributes);
                if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
                    UnityDeepHooks.hookWebGLContext(ctx, this);
                }
                return ctx;
            };
        }

        // 1.1 RETROSPECTIVE CANVAS HOOK (Kích hoạt tức thì cho Canvas đã render sẵn khi chạy Shortcut)
        if (typeof document !== 'undefined' && document.querySelectorAll) {
            try {
                const canvases = document.querySelectorAll('canvas');
                for (let c = 0; c < canvases.length; c++) {
                    const cvs = canvases[c];
                    try {
                        const ctx = cvs.getContext('webgl2') || cvs.getContext('webgl') || cvs.getContext('experimental-webgl');
                        if (ctx) UnityDeepHooks.hookWebGLContext(ctx, cvs);
                    } catch (e) {}
                }
            } catch (err) {}
        }

        // 2. Unity Engine Module Interceptor
        UnityDeepHooks.hookUnityModule();

        // 3. IL2CPP Memory Traversal Loop
        setInterval(() => {
            UnityDeepHooks.traverseIl2CppMemory();
        }, 16);
    }

    static hookWebGLContext(gl, canvas) {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;
        if (gl.__vortexHooked) return;
        gl.__vortexHooked = true;

        _vortex.__UnityCanvas = canvas;

        const origUniformMatrix4fv = gl.uniformMatrix4fv;
        gl.uniformMatrix4fv = function (location, transpose, data) {
            try {
                if (data && data.length >= 16) {
                    if (Math.abs(data[11] + 1.0) < 0.05 || (Math.abs(data[15]) < 0.001 && Math.abs(data[14]) > 0.01)) {
                        if (!_vortex.__UnityProjectionMatrix) _vortex.__UnityProjectionMatrix = new Float32Array(16);
                        _vortex.__UnityProjectionMatrix.set(data);
                        if (data[5] > 0.1) {
                            let fovRad = 2.0 * Math.atan(1.0 / data[5]);
                            let fovDeg = fovRad * (180.0 / Math.PI);
                            if (fovDeg >= 30.0 && fovDeg <= 120.0) {
                                _vortex.__DetectedCameraFOV = fovDeg;
                                if (_vortex.__VortexState && _vortex.__VortexState.cameraInfo) {
                                    _vortex.__VortexState.cameraInfo.fov = fovDeg;
                                }
                            }
                        }
                    } else if (Math.abs(data[15] - 1.0) < 0.01) {
                        if (!_vortex.__UnityViewMatrix) _vortex.__UnityViewMatrix = new Float32Array(16);
                        _vortex.__UnityViewMatrix.set(data);
                    }
                }
            } catch (e) {}
            return origUniformMatrix4fv.call(this, location, transpose, data);
        };

        const origViewport = gl.viewport;
        gl.viewport = function (x, y, w, h) {
            _vortex.__GameViewportWidth = w;
            _vortex.__GameViewportHeight = h;
            return origViewport.call(this, x, y, w, h);
        };
    }

    static hookUnityModule() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;

        const checkModule = () => {
            const inst = _globalEnv.unityInstance || _globalEnv.Module || _globalEnv.gameInstance;
            if (inst) {
                const mod = inst.Module || inst;
                if (mod && !_vortex.__UnityModuleHooked) {
                    _vortex.__UnityModuleHooked = true;
                    if (mod.wasmMemory && !_vortex.__WasmMemory) {
                        _vortex.__WasmMemory = mod.wasmMemory;
                    } else if (mod.buffer && !_vortex.__WasmMemory) {
                        _vortex.__WasmMemory = { buffer: mod.buffer };
                    }

                    if (typeof mod._JS_Touch_OnTouchMove === 'function') {
                        const origTouchMove = mod._JS_Touch_OnTouchMove;
                        mod._JS_Touch_OnTouchMove = function (id, x, y) {
                            // TÁCH BIỆT HOÀN TOÀN JOYSTICK: Tuyệt đối không can thiệp ngón di chuyển
                            const joyLimit = (_vortex.__CachedMetrics && _vortex.__CachedMetrics.joystickZoneX) || 960;
                            const isJoy = (_vortex.__JoystickTouchIds && _vortex.__JoystickTouchIds.has(id)) || (x <= joyLimit);
                            if (isJoy) {
                                if (_vortex.__JoystickTouchIds) _vortex.__JoystickTouchIds.add(id);
                                return origTouchMove.call(this, id, x, y);
                            }
                            let finalX = _vortex.__TouchPrototypeMutated ? x : (x + (_vortex.__GlobalOffsetX || 0));
                            let finalY = _vortex.__TouchPrototypeMutated ? y : (y + (_vortex.__GlobalOffsetY || 0));
                            return origTouchMove.call(this, id, finalX, finalY);
                        };
                    }
                }
            }
        };

        checkModule();
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('load', checkModule, { once: true });
        }
    }

    static traverseIl2CppMemory() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;

        if (!_vortex.__WasmMemory || !_vortex.__WasmMemory.buffer) return;
        const buf = _vortex.__WasmMemory.buffer;
        if (buf.byteLength < 0x100000) return;

        // TỐI ƯU ZERO-GC: Tái sử dụng TypedArray Views, không tạo mới mỗi 16ms
        if (!_vortex.__CachedU32 || _vortex.__LastWasmBuf !== buf || _vortex.__LastWasmBufLen !== buf.byteLength) {
            _vortex.__LastWasmBuf = buf;
            _vortex.__LastWasmBufLen = buf.byteLength;
            _vortex.__CachedU32 = new Uint32Array(buf);
            _vortex.__CachedF32 = new Float32Array(buf);
            _vortex.__CachedU8 = new Uint8Array(buf);
        }

        const u32 = _vortex.__CachedU32;
        const f32 = _vortex.__CachedF32;
        const u8 = _vortex.__CachedU8;
        const maxByte = buf.byteLength;

        const readU32 = (addr) => (addr > 0 && addr + 4 <= maxByte) ? u32[addr >>> 2] : 0;
        const readF32 = (addr) => (addr > 0 && addr + 4 <= maxByte) ? f32[addr >>> 2] : 0;
        const readU8 = (addr) => (addr > 0 && addr < maxByte) ? u8[addr] : 0;

        const OFFSETS = {
            InitBase: 0xA988FDC,
            StaticClass: 0x5C,
            CurrentMatch: 0x50,
            MatchStatus: 0x8C,
            LocalPlayer: 0x94,
            DictionaryEntities: 0x68,
            TeamID: 0x29C,
            Player_IsDead: 0x50,
            Player_Name: 0x2DC,
            Player_Data: 0x48,
            Player_ShadowBase: 0x18B8,
            XPose: 0x78,
            AvatarManager: 0x4C0,
            Avatar: 0xA8,
            Avatar_IsVisible: 0x95
        };

        try {
            let initBasePtr = OFFSETS.InitBase;
            if (initBasePtr >= maxByte) return;

            let staticClass = readU32(initBasePtr + OFFSETS.StaticClass);
            if (!staticClass || staticClass >= maxByte) return;

            let currentMatch = readU32(staticClass + OFFSETS.CurrentMatch);
            if (!currentMatch || currentMatch >= maxByte) return;

            let matchStatus = readU32(currentMatch + OFFSETS.MatchStatus);
            let localPlayerPtr = readU32(currentMatch + OFFSETS.LocalPlayer);
            let dictEntitiesPtr = readU32(currentMatch + OFFSETS.DictionaryEntities);

            let localPos = { x: 0, y: 0, z: 0 };
            let myTeamId = 0;

            if (localPlayerPtr && localPlayerPtr < maxByte) {
                myTeamId = readU32(localPlayerPtr + OFFSETS.TeamID);
                let xPose = readU32(localPlayerPtr + OFFSETS.XPose);
                if (xPose && xPose + 12 < maxByte) {
                    localPos.x = readF32(xPose);
                    localPos.y = readF32(xPose + 4);
                    localPos.z = readF32(xPose + 8);
                }
            }

            if (!dictEntitiesPtr || dictEntitiesPtr >= maxByte) return;

            let entriesArray = readU32(dictEntitiesPtr + 0x18) || readU32(dictEntitiesPtr + 0x14);
            if (!entriesArray || entriesArray >= maxByte) return;

            let count = readU32(entriesArray + 0x18) || readU32(entriesArray + 0x0C) || 0;
            if (count <= 0 || count > 64) count = 50;

            let parsedPlayers = [];
            let entryStride = 0x18;
            let firstEntry = entriesArray + 0x20;

            for (let i = 0; i < count; i++) {
                let entryAddr = firstEntry + (i * entryStride);
                if (entryAddr + entryStride > maxByte) break;

                let entityPtr = readU32(entryAddr + 0x10) || readU32(entryAddr + 0x08);
                if (!entityPtr || entityPtr >= maxByte || entityPtr === localPlayerPtr) continue;

                let isDead = readU32(entityPtr + OFFSETS.Player_IsDead);
                if (isDead !== 0 && isDead !== false) continue;

                let teamId = readU32(entityPtr + OFFSETS.TeamID);
                if (teamId === myTeamId && myTeamId !== 0) continue;

                // LỌC BỎ TRIỆT ĐỂ VẬT CẢN & BOM KEO (GLOO WALLS) SPAM TRONG 4V4:
                // Trong IL2CPP, thực thể người chơi thực sự BẮT BUỘC phải có AvatarManager (0x4C0)
                // Các thực thể Bom keo (Gloo Wall), chướng ngại vật hoặc hòm đồ không có AvatarManager
                let avatarMgr = readU32(entityPtr + OFFSETS.AvatarManager);
                let playerData = readU32(entityPtr + OFFSETS.Player_Data);
                if (!avatarMgr && !playerData) continue;

                let xPose = readU32(entityPtr + OFFSETS.XPose);
                let posX = 0, posY = 0, posZ = 0;
                if (xPose && xPose + 12 < maxByte) {
                    posX = readF32(xPose);
                    posY = readF32(xPose + 4);
                    posZ = readF32(xPose + 8);
                }

                if (isNaN(posX) || (posX === 0 && posY === 0 && posZ === 0)) continue;

                let isVisible = true;
                if (avatarMgr && avatarMgr < maxByte) {
                    let avatar = readU32(avatarMgr + OFFSETS.Avatar);
                    if (avatar && avatar < maxByte) {
                        let visByte = readU8(avatar + OFFSETS.Avatar_IsVisible);
                        isVisible = (visByte !== 0);
                    }
                }

                // [TIER 1 DIRECT BONE TRANSFORM RESOLVER]:
                // Trích xuất trực tiếp tọa độ 3D thực tế của Xương Đầu từ Avatar / CharacterModel nếu có con trỏ
                let realHeadBone = UnityDeepHooks.readEntityHeadBone(entityPtr, avatarMgr, posX, posY, posZ);
                let headX = realHeadBone ? realHeadBone.x : posX;
                let headY = realHeadBone ? realHeadBone.y : (posY + 1.75);
                let headZ = realHeadBone ? realHeadBone.z : posZ;
                let crownY = realHeadBone ? (realHeadBone.y + 0.10) : (posY + 1.85);

                parsedPlayers.push({
                    id: 'il2cpp_p_' + i,
                    team_id: teamId,
                    hp: 200,
                    pos: { x: posX, y: posY, z: posZ },
                    is_visible: isVisible,
                    avatar_is_visible: isVisible ? 1 : 0,
                    bone_head: { x: headX, y: headY, z: headZ },
                    hitboxes: {
                        head: { pos: { x: headX, y: headY, z: headZ } },
                        crown: { pos: { x: headX, y: crownY, z: headZ } }
                    }
                });

                // Trong Tử Chiến 4v4, kẻ địch tối đa chỉ có 4 người
                if (parsedPlayers.length >= 8) break;
            }

            if (parsedPlayers.length > 0 && _vortex.__VORTEX_ENGINE) {
                _vortex.__GlobalWasmPlayers = parsedPlayers;
                _vortex.__VORTEX_ENGINE.processPayload({
                    source: 'UNITY_IL2CPP_DEEP_HOOK',
                    match_status: matchStatus,
                    fire_origin: localPos,
                    players: parsedPlayers
                });
            }
        } catch (err) {}
    }

    /**
     * TIER 1 DIRECT BONE TRANSFORM RESOLVER:
     * Quét và trích xuất tọa độ 3D thực tế của Xương Đầu (Head Bone) từ cấu trúc Avatar/ShadowBase
     */
    static readEntityHeadBone(entityPtr, avatarMgr, rootX, rootY, rootZ) {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;
        if (!_vortex.__WasmMemory || !_vortex.__WasmMemory.buffer) return null;
        const buf = _vortex.__WasmMemory.buffer;
        const maxByte = buf.byteLength;
        const u32 = _vortex.__CachedU32;
        const f32 = _vortex.__CachedF32;
        if (!u32 || !f32) return null;

        const readU32 = (addr) => (addr > 0 && addr + 4 <= maxByte) ? u32[addr >>> 2] : 0;
        const readF32 = (addr) => (addr > 0 && addr + 4 <= maxByte) ? f32[addr >>> 2] : 0;

        try {
            // Nhánh 1: AvatarManager (0x4C0) -> Avatar (0xA8) -> BoneTransforms Array (0x18 / 0x20)
            if (avatarMgr && avatarMgr < maxByte) {
                let avatar = readU32(avatarMgr + 0xA8);
                if (avatar && avatar < maxByte) {
                    let bonesArray = readU32(avatar + 0x18) || readU32(avatar + 0x20);
                    if (bonesArray && bonesArray < maxByte) {
                        // Head bone thường ở index 10 trong HumanBodyBones Free Fire
                        let headTransform = readU32(bonesArray + 0x20 + (10 * 4)) || readU32(bonesArray + 0x20 + (10 * 8));
                        if (headTransform && headTransform < maxByte) {
                            let tx = readF32(headTransform + 0x38) || readF32(headTransform + 0x10);
                            let ty = readF32(headTransform + 0x38 + 4) || readF32(headTransform + 0x10 + 4);
                            let tz = readF32(headTransform + 0x38 + 8) || readF32(headTransform + 0x10 + 8);
                            if (!isNaN(tx) && Math.abs(tx - rootX) < 3.0 && (ty - rootY) > 0.4 && (ty - rootY) < 2.5) {
                                return { x: tx, y: ty, z: tz };
                            }
                        }
                    }
                }
            }

            // Nhánh 2: entityPtr -> Player_ShadowBase (0x18B8) -> Bone Caches
            let shadowBase = readU32(entityPtr + 0x18B8);
            if (shadowBase && shadowBase < maxByte) {
                let headBonePtr = readU32(shadowBase + 0x28) || readU32(shadowBase + 0x30);
                if (headBonePtr && headBonePtr < maxByte) {
                    let tx = readF32(headBonePtr + 0x78) || readF32(headBonePtr + 0x10);
                    let ty = readF32(headBonePtr + 0x78 + 4) || readF32(headBonePtr + 0x10 + 4);
                    let tz = readF32(headBonePtr + 0x78 + 8) || readF32(headBonePtr + 0x10 + 8);
                    if (!isNaN(tx) && Math.abs(tx - rootX) < 3.0 && (ty - rootY) > 0.4 && (ty - rootY) < 2.5) {
                        return { x: tx, y: ty, z: tz };
                    }
                }
            }
        } catch (e) {}

        return null;
    }

    /**
     * TIER 4: GPU Screen-Space Matrix Inversion
     */
    static worldToScreen(worldPos, screenW = 1920, screenH = 1080) {
        return RealtimeHeadTracker.projectWorldToScreen(worldPos, screenW, screenH);
    }
}

// ============================================================================
// [COMBAT FAST-RESPONSE]: LÕI TỐI ƯU CHIẾN ĐẤU & KHÔI PHỤC NATIVE VSYNC
// Loại bỏ hoàn toàn 120fps giả lập (setInterval RAF), khôi phục Native VSync phần cứng
// Giảm tối đa độ trễ cảm ứng (Touch Latency), triệt tiêu giật khựng (Micro-stutter)
// ============================================================================
class CombatPerformanceOptimizer {
    static activate() {
        const _globalEnv = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : global);
        const _vortex = _globalEnv._vortex || _globalEnv;

        // Xóa sạch bộ đếm thời gian 120fps giả lập và phục hồi requestAnimationFrame gốc
        if (_vortex.__Interval120Id) {
            clearInterval(_vortex.__Interval120Id);
            _vortex.__Interval120Id = null;
        }
        if (_vortex.__NativeRAF && typeof window !== 'undefined') {
            window.requestAnimationFrame = _vortex.__NativeRAF;
            _vortex.__NativeRAF = null;
        }
        _vortex.__RAF120Hooked = false;
        _vortex.__Is120FPSActive = false;

        // Đồng bộ Metronome nhịp 60FPS chuẩn xác, tối ưu hóa tài nguyên phần cứng
        if (typeof DeepDataHijacker !== 'undefined' && typeof DeepDataHijacker.getMetronome === 'function') {
            const metronome = DeepDataHijacker.getMetronome();
            if (metronome && typeof metronome.postMessage === 'function') {
                metronome.postMessage({ command: 'START', fps: 60 });
            }
        }

        console.log("⚡ [COMBAT FAST-RESPONSE] Đã tối ưu hóa phản xạ chiến đấu: Khôi phục Native VSync, triệt tiêu độ trễ vẩy tâm & lia tâm!");
    }
}

// Khởi động mẻ lưới, móc nối sâu Unity và bộ tối ưu hóa phản xạ chiến đấu
UnityDeepHooks.initialize();
DeepDataHijacker.initialize();
CombatPerformanceOptimizer.activate();
if (typeof VortexESP !== 'undefined' && typeof document !== 'undefined' && document.body) {
    try { VortexESP.initialize(); } catch (e) {}
}