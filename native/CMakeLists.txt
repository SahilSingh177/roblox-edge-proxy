cmake_minimum_required(VERSION 3.15)
cmake_policy(SET CMP0091 NEW)
project(rbx_native)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# cmake-js populates CMAKE_JS_INC / CMAKE_JS_SRC / CMAKE_JS_LIB
include_directories(${CMAKE_JS_INC})

file(GLOB SOURCE_FILES "src/*.cc")

add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

# Resolve node-addon-api headers from the project's node_modules.
# `include_dir` returns a relative path; resolve it against the project root
# so CMake (running from native/build/) can find napi.h.
execute_process(
  COMMAND node -p "require('path').resolve(require('node-addon-api').include_dir)"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/..
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})

# Require a reasonably modern N-API and enable C++ exceptions from node-addon-api
add_definitions(-DNAPI_VERSION=8 -DNAPI_CPP_EXCEPTIONS)

# Windows: generate an import lib for node.exe symbols
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()
