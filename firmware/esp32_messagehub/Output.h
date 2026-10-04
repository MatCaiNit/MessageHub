#ifndef OUTPUT_H
#define OUTPUT_H

#include <Arduino.h>

// outputId (id) phai khop tung ky tu voi outputId luu trong Device.outputs
// tren backend (backend tu tao lan dau khi nhan duoc su kien "boot").
struct Output {
  const char* id;
  uint8_t     pin;
  bool        activeLow;
  bool        state;
};

#endif