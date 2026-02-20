/**
 * 공통코드(bo_lookup_value) 조회 유틸
 * db: Firestore 인스턴스 (firebase.firestore())
 */

const LOOKUP_VALUE_COLLECTION = "bo_lookup_value";

/**
 * YYYYMMDD 문자열을 숫자로 변환 (hyphen 제거 후 파싱)
 * @param {string} ymd - "20260101" 또는 "2026-01-01"
 * @returns {number}
 */
function ymdToNumber(ymd) {
  if (!ymd || typeof ymd !== "string") return NaN;
  const s = ymd.replace(/-/g, "").trim();
  return s.length === 8 ? parseInt(s, 10) : NaN;
}

/**
 * type_cd, value_cd 및 기준일(p_ymd)에 해당하는 공통코드의 value_nm(구분명) 반환
 * @param {FirebaseFirestore.Firestore} db - Firestore 인스턴스
 * @param {string} p_type_cd - 대분류 코드
 * @param {string} p_value_cd - 중분류 코드
 * @param {string} p_ymd - 기준일 (YYYYMMDD 8자리)
 * @returns {Promise<string|null>} value_nm 또는 null
 */
function getLookupValueName(db, p_type_cd, p_value_cd, p_ymd) {
  return new Promise(function (resolve, reject) {
    if (!p_type_cd || !p_value_cd || !p_ymd) {
      reject(new Error("필수 파라미터가 누락되었습니다."));
      return;
    }

    const ymdStr = String(p_ymd).trim().replace(/-/g, "");
    if (ymdStr.length !== 8) {
      reject(new Error("날짜 형식이 올바르지 않습니다. (YYYYMMDD 형식 필요)"));
      return;
    }

    const ymdNumber = parseInt(ymdStr, 10);
    if (isNaN(ymdNumber)) {
      reject(new Error("날짜 형식이 올바르지 않습니다. (YYYYMMDD 형식 필요)"));
      return;
    }

    db.collection(LOOKUP_VALUE_COLLECTION)
      .where("type_cd", "==", p_type_cd)
      .where("value_cd", "==", p_value_cd)
      .get()
      .then(function (querySnapshot) {
        if (querySnapshot.empty) {
          resolve(null);
          return;
        }

        let foundValue = null;

        querySnapshot.forEach(function (doc) {
          if (foundValue !== null) return;
          const data = doc.data();
          const startYmd = data.start_ymd || "";
          const endYmd = data.end_ymd || "";

          const startNumber = ymdToNumber(startYmd);
          const endNumber = ymdToNumber(endYmd);

          if (!isNaN(startNumber) && !isNaN(endNumber) && ymdNumber >= startNumber && ymdNumber <= endNumber) {
            foundValue = data.value_nm || null;
          }
        });

        resolve(foundValue);
      })
      .catch(function (error) {
        console.error("공통코드 조회 오류:", error);
        reject(error);
      });
  });
}

/**
 * type_cd, value_cd 및 기준일(p_ymd)에 해당하는 공통코드의 sort 값 반환
 * @param {FirebaseFirestore.Firestore} db - Firestore 인스턴스
 * @param {string} p_type_cd - 대분류 코드
 * @param {string} p_value_cd - 중분류 코드
 * @param {string} p_ymd - 기준일 (YYYYMMDD 8자리)
 * @returns {Promise<number|null>} sort 또는 null
 */
function getLookupValueSort(db, p_type_cd, p_value_cd, p_ymd) {
  return new Promise(function (resolve, reject) {
    if (!p_type_cd || !p_value_cd || !p_ymd) {
      reject(new Error("필수 파라미터가 누락되었습니다."));
      return;
    }

    const ymdStr = String(p_ymd).trim().replace(/-/g, "");
    if (ymdStr.length !== 8) {
      reject(new Error("날짜 형식이 올바르지 않습니다. (YYYYMMDD 형식 필요)"));
      return;
    }

    const ymdNumber = parseInt(ymdStr, 10);
    if (isNaN(ymdNumber)) {
      reject(new Error("날짜 형식이 올바르지 않습니다. (YYYYMMDD 형식 필요)"));
      return;
    }

    db.collection(LOOKUP_VALUE_COLLECTION)
      .where("type_cd", "==", p_type_cd)
      .where("value_cd", "==", p_value_cd)
      .get()
      .then(function (querySnapshot) {
        if (querySnapshot.empty) {
          resolve(null);
          return;
        }

        let foundSort = null;

        querySnapshot.forEach(function (doc) {
          if (foundSort !== null) return;
          const data = doc.data();
          const startYmd = data.start_ymd || "";
          const endYmd = data.end_ymd || "";

          const startNumber = ymdToNumber(startYmd);
          const endNumber = ymdToNumber(endYmd);

          if (!isNaN(startNumber) && !isNaN(endNumber) && ymdNumber >= startNumber && ymdNumber <= endNumber) {
            foundSort = data.sort !== undefined && data.sort !== null ? data.sort : null;
          }
        });

        resolve(foundSort);
      })
      .catch(function (error) {
        console.error("공통코드 정렬 조회 오류:", error);
        reject(error);
      });
  });
}

/**
 * type_cd 및 기준일(p_ymd)에 해당하는 공통코드 목록 반환 (해당 일자가 start_ymd~end_ymd 구간에 포함되는 항목)
 * @param {FirebaseFirestore.Firestore} db - Firestore 인스턴스
 * @param {string} p_type_cd - 대분류 코드
 * @param {string} p_ymd - 기준일 (YYYYMMDD 8자리)
 * @returns {Promise<Array<{value_cd: string, value_nm: string, sort: number}>>}
 */
function getLookupValueList(db, p_type_cd, p_ymd) {
  return new Promise(function (resolve, reject) {
    if (!p_type_cd || !p_ymd) {
      reject(new Error("필수 파라미터가 누락되었습니다."));
      return;
    }

    const ymdStr = String(p_ymd).trim().replace(/-/g, "");
    if (ymdStr.length !== 8) {
      reject(new Error("날짜 형식이 올바르지 않습니다. (YYYYMMDD 형식 필요)"));
      return;
    }

    const ymdNumber = parseInt(ymdStr, 10);
    if (isNaN(ymdNumber)) {
      reject(new Error("날짜 형식이 올바르지 않습니다. (YYYYMMDD 형식 필요)"));
      return;
    }

    function processSnapshot(querySnapshot, result) {
      querySnapshot.forEach(function (doc) {
        const data = doc.data();
        const startYmd = data.start_ymd || "";
        const endYmd = data.end_ymd || "";

        const startNumber = ymdToNumber(startYmd);
        const endNumber = ymdToNumber(endYmd);

        if (!isNaN(startNumber) && !isNaN(endNumber) && ymdNumber >= startNumber && ymdNumber <= endNumber) {
          result.push({
            value_cd: String(data.value_cd ?? ""),
            value_nm: String(data.value_nm ?? ""),
            sort: data.sort !== undefined && data.sort !== null ? data.sort : 0,
          });
        }
      });
    }

    const result = [];

    db.collection(LOOKUP_VALUE_COLLECTION)
      .where("type_cd", "==", p_type_cd)
      .get()
      .then(function (querySnapshot) {
        processSnapshot(querySnapshot, result);
        if (result.length === 0 && /^\d+$/.test(String(p_type_cd).trim())) {
          return db.collection(LOOKUP_VALUE_COLLECTION)
            .where("type_cd", "==", parseInt(p_type_cd, 10))
            .get()
            .then(function (snap2) {
              processSnapshot(snap2, result);
              return result;
            });
        }
        return result;
      })
      .then(function (res) {
        const list = Array.isArray(res) ? res : result;
        list.sort(function (a, b) {
          const sortA = a.sort ?? 0;
          const sortB = b.sort ?? 0;
          if (sortA !== sortB) return sortA - sortB;
          const codeA = parseInt(a.value_cd, 10) || 0;
          const codeB = parseInt(b.value_cd, 10) || 0;
          return codeA - codeB;
        });
        resolve(list);
      })
      .catch(function (error) {
        console.error("공통코드 리스트 조회 오류:", error);
        reject(error);
      });
  });
}

export { getLookupValueName, getLookupValueList, getLookupValueSort, ymdToNumber };
